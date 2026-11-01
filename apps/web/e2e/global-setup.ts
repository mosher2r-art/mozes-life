import { execFileSync } from "node:child_process";
import { USERS } from "./fixtures";

/** Recreates the test database from migrations and seeds one user per role. */
export default function globalSetup() {
  const DATABASE_URL = process.env.TEST_DATABASE_URL ?? "postgres://mozes:mozes@localhost:5432/mozes_life_test";
  if (!/_test\b/.test(DATABASE_URL)) throw new Error("Refusing to reset a non-test database");
  const env = { ...process.env, DATABASE_URL };
  const run = (args: string[], extra: Record<string, string> = {}) =>
    execFileSync("pnpm", args, { env: { ...env, ...extra }, stdio: "pipe" });

  execFileSync("psql", [DATABASE_URL, "-q", "-c", "drop schema if exists public cascade; drop schema if exists drizzle cascade; create schema public;"], { stdio: "pipe" });
  run(["db:migrate"]);
  run(["user:create", "--email", USERS.admin.email, "--name", USERS.admin.name, "--role", "super_admin"], { MOZES_NEW_PASSWORD: USERS.admin.password });
  run(["user:create", "--email", USERS.editor.email, "--name", USERS.editor.name, "--role", "editor"], { MOZES_NEW_PASSWORD: USERS.editor.password });
  run(["user:create", "--email", USERS.learner.email, "--name", USERS.learner.name, "--org-name", "ארגון בדיקה", "--org-role", "learner"], { MOZES_NEW_PASSWORD: USERS.learner.password });
  run(["demo:publish", "--enroll", USERS.learner.email]);
}
