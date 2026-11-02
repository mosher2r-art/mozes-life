/**
 * First-run bootstrap for hosted environments (runs on every start, idempotent).
 *
 * If no super_admin exists yet and BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD are set,
 * creates that administrator. With BOOTSTRAP_DEMO_COURSE=true it also publishes the
 * non-medical demo course and enrolls the administrator, so the Academy has content.
 * Once an administrator exists the variables are ignored and can be removed.
 */
import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { postgresConfig } from "../src/db/postgres-config";
import * as schema from "../src/db/schema";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is not set");

const email = process.env.BOOTSTRAP_ADMIN_EMAIL?.trim().toLowerCase();
const password = process.env.BOOTSTRAP_ADMIN_PASSWORD;
const name = process.env.BOOTSTRAP_ADMIN_NAME?.trim() || "מנהל/ת מערכת";
const withDemo = process.env.BOOTSTRAP_DEMO_COURSE === "true";

const pool = new Pool(postgresConfig(url));
const db = drizzle(pool, { schema });

try {
  const admins = await db
    .select({ userId: schema.userPlatformRole.userId })
    .from(schema.userPlatformRole)
    .where(eq(schema.userPlatformRole.role, "super_admin"))
    .limit(1);

  if (admins.length) {
    console.log("bootstrap: an administrator already exists — nothing to do");
  } else if (!email || !password) {
    console.log("bootstrap: no administrator yet; set BOOTSTRAP_ADMIN_EMAIL and BOOTSTRAP_ADMIN_PASSWORD to create one");
  } else {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error("BOOTSTRAP_ADMIN_EMAIL is not a valid email");
    if (password.length < 10) throw new Error("BOOTSTRAP_ADMIN_PASSWORD must be at least 10 characters");

    await db.transaction(async (tx) => {
      const [existing] = await tx.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email));
      const userId = existing?.id ?? randomUUID();
      if (!existing) {
        await tx.insert(schema.user).values({ id: userId, email, name, emailVerified: true });
        await tx.insert(schema.account).values({
          id: randomUUID(),
          accountId: userId,
          providerId: "credential",
          userId,
          password: await hashPassword(password),
        });
      }
      await tx.insert(schema.userPlatformRole).values({ userId, role: "super_admin" }).onConflictDoNothing();
      await tx.insert(schema.auditLog).values({ action: "user.bootstrap_admin", entity: "user", entityId: userId, details: { email } });
    });
    console.log(`bootstrap: created administrator ${email}`);

    if (withDemo) {
      execFileSync("pnpm", ["demo:publish", "--enroll", email], { stdio: "inherit" });
    }
  }
} finally {
  await pool.end();
}
