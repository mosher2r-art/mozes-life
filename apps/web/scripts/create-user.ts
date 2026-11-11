/**
 * Creates a user from the command line (bootstrap the first super_admin, or staff).
 * Public sign-up is disabled, so this is the only way to create the first account.
 *
 *   pnpm user:create --email a@b.co --name "שם" --role super_admin
 *   pnpm user:create --email l@b.co --name "לומד" --org-name "ארגון בדיקה" --org-role learner
 *
 * The password is read from the MOZES_NEW_PASSWORD environment variable or
 * prompted interactively — never passed as a CLI argument (shell history).
 */
import { randomUUID } from "node:crypto";
import { createInterface } from "node:readline/promises";
import { parseArgs } from "node:util";
import { hashPassword } from "better-auth/crypto";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { postgresConfig } from "../src/db/postgres-config";
import { passwordProblem, PASSWORD_MIN } from "../src/lib/password-policy";
import { isOrgRole, isPlatformRole } from "@mozes/authz";
import * as schema from "../src/db/schema";

const { values } = parseArgs({
  options: {
    email: { type: "string" },
    name: { type: "string" },
    role: { type: "string", multiple: true },
    "org-name": { type: "string" },
    "org-role": { type: "string" },
  },
});

function fail(msg: string): never {
  console.error(`Error: ${msg}`);
  process.exit(1);
}

const email = values.email?.trim().toLowerCase();
const name = values.name?.trim();
if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) fail("--email is required and must be valid");
if (!name) fail("--name is required");
const roles = values.role ?? [];
for (const r of roles) if (!isPlatformRole(r)) fail(`unknown platform role: ${r}`);
if (values["org-role"] && !isOrgRole(values["org-role"])) fail(`unknown org role: ${values["org-role"]}`);
if (values["org-role"] && !values["org-name"]) fail("--org-role requires --org-name");
if (!roles.length && !values["org-role"]) fail("give at least one --role or --org-role");

let password = process.env.MOZES_NEW_PASSWORD;
if (!password) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  password = await rl.question(`Password (min ${PASSWORD_MIN} chars): `);
  rl.close();
}
const passwordError=passwordProblem(password);
if(passwordError)fail(passwordError);

const url = process.env.DATABASE_URL ?? fail("DATABASE_URL is not set");
const pool = new Pool(postgresConfig(url));
const db = drizzle(pool, { schema });

try {
  const existing = await db.select({ id: schema.user.id }).from(schema.user).where(eq(schema.user.email, email));
  if (existing.length) fail(`a user with email ${email} already exists`);

  const userId = randomUUID();
  const hash = await hashPassword(password);

  await db.transaction(async (tx) => {
    await tx.insert(schema.user).values({ id: userId, email, name, emailVerified: true });
    await tx.insert(schema.account).values({
      id: randomUUID(),
      accountId: userId,
      providerId: "credential",
      userId,
      password: hash,
    });
    for (const role of roles) {
      if (isPlatformRole(role)) await tx.insert(schema.userPlatformRole).values({ userId, role });
    }
    const orgRole = values["org-role"];
    if (orgRole && isOrgRole(orgRole)) {
      const orgName = values["org-name"]!;
      let [org] = await tx.select().from(schema.organization).where(eq(schema.organization.name, orgName));
      if (!org) {
        [org] = await tx
          .insert(schema.organization)
          .values({ id: randomUUID(), name: orgName, type: "company" })
          .returning();
      }
      await tx.insert(schema.membership).values({ orgId: org!.id, userId, role: orgRole });
    }
    await tx.insert(schema.auditLog).values({
      actorId: null,
      action: "user.create.cli",
      entity: "user",
      entityId: userId,
      details: { email, roles, orgRole: orgRole ?? null },
    });
  });

  console.log(`Created ${email} (${[...roles, values["org-role"]].filter(Boolean).join(", ")})`);
} finally {
  await pool.end();
}
