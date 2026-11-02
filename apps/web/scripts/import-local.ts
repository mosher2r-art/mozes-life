import { parseArgs } from "node:util";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import path from "node:path";
import { eq } from "drizzle-orm";
import { can, isPlatformRole } from "@mozes/authz";
import { db, pool } from "../src/db/index";
import { user, userPlatformRole } from "../src/db/schema";
import { analyseImport, getImport, reserveImport } from "../src/server/importer";
import { putObject } from "../src/server/storage";

// Operator workflow for packages above the Worker memory budget. Uses the exact
// same validation, format, extraction and import tables as the web workflow.
if (process.env.DEPLOY_TARGET === "cloudflare") throw new Error("Run this operator command with Node, without DEPLOY_TARGET=cloudflare");
const { values } = parseArgs({ options: { file: { type:"string" }, actor: { type:"string" } } });
if (!values.file || !values.actor) throw new Error("Usage: import:local --file package.zip --actor existing-admin-user-id");
try {
  const [account] = await db.select().from(user).where(eq(user.id, values.actor));
  const roles = await db.select().from(userPlatformRole).where(eq(userPlatformRole.userId, values.actor));
  if (!account || account.disabled || !can({ userId:account.id, platformRoles:roles.map(r => r.role).filter(isPlatformRole), orgRoles:{} }, "course.import")) throw new Error("The actor must be an enabled administrator allowed to import courseware");
  const file = path.resolve(values.file);
  const size = (await stat(file)).size;
  const reserved = await reserveImport(account.id, path.basename(file), size);
  if (!reserved.ok) throw new Error(reserved.message);
  const job = await getImport(reserved.id);
  if (!job) throw new Error("Import reservation missing");
  await putObject(job.storageKey, createReadStream(file), size, "application/zip");
  const result = await analyseImport(account.id, job.id);
  console.log(JSON.stringify(result, null, 2));
  if (result?.status !== "analysed") process.exitCode = 1;
  // No course is published automatically. Review and continue in Studio.
} finally { await pool.end(); }
