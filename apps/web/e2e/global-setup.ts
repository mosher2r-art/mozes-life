import { execFileSync } from "node:child_process";
import { Pool } from "pg";
import { USERS } from "./fixtures";

/** Seeds a dedicated EMPTY test database. Never drops schemas or existing data. */
export default async function globalSetup() {
  const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://mozes:mozes@localhost:5432/mozes_life_test";
  if (!new URL(DATABASE_URL).pathname.endsWith("_test")) throw new Error("A dedicated *_test database is required");
  const env = { ...process.env, DATABASE_URL };
  const run = (args: string[], extra: Record<string, string> = {}) =>
    execFileSync(process.env.PNPM_SCRIPT ? process.execPath : "pnpm", process.env.PNPM_SCRIPT ? [process.env.PNPM_SCRIPT, ...args] : args, { env: { ...env, ...extra }, stdio: "pipe" });

  const pool = new Pool({ connectionString: DATABASE_URL });
  try {
    const { rowCount } = await pool.query("select 1 from pg_tables where schemaname in ('public','drizzle')");
    if (rowCount) throw new Error("Test database must be empty; create a new dedicated test database. No data has been deleted.");
  } finally { await pool.end(); }
  run(["db:migrate"]);
  run(["user:create", "--email", USERS.admin.email, "--name", USERS.admin.name, "--role", "super_admin"], { MOZES_NEW_PASSWORD: USERS.admin.password });
  run(["user:create", "--email", USERS.editor.email, "--name", USERS.editor.name, "--role", "editor"], { MOZES_NEW_PASSWORD: USERS.editor.password });
  run(["user:create", "--email", USERS.learner.email, "--name", USERS.learner.name, "--org-name", "ארגון בדיקה", "--org-role", "learner"], { MOZES_NEW_PASSWORD: USERS.learner.password });
  run(["demo:publish", "--enroll", USERS.learner.email]);
}
