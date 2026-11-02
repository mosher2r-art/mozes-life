import { createHash } from "node:crypto";
import { readFile, writeFile, mkdir } from "node:fs/promises";

const root = new URL("../../../", import.meta.url);
const migrations = new URL("../drizzle/", import.meta.url);
const journal = JSON.parse(await readFile(new URL("meta/_journal.json", migrations), "utf8")) as { entries: { tag: string; when: number; idx: number }[] };
let sql = `-- GENERATED from the Drizzle journal. Fresh database ONLY; never use for an existing installation.\n-- Run as the new Supabase project owner. No passwords or application data are included.\nBEGIN;\nSET LOCAL search_path = public;\nDO $$ BEGIN\n IF to_regclass('public.user') IS NOT NULL OR to_regclass('drizzle.__drizzle_migrations') IS NOT NULL THEN\n  RAISE EXCEPTION 'Database already initialized. Use reviewed incremental migrations instead.';\n END IF;\nEND $$;\n`;
const hashes: { hash: string; when: number }[] = [];
for (const [index, entry] of journal.entries.entries()) {
  if (entry.idx !== index || (index && entry.when <= journal.entries[index - 1]!.when)) throw new Error("Invalid migration order");
  const content = await readFile(new URL(`${entry.tag}.sql`, migrations), "utf8");
  hashes.push({ hash: createHash("sha256").update(content).digest("hex"), when: entry.when });
  sql += `\n-- ${entry.tag}\n${content.replaceAll("--> statement-breakpoint", "")}\n`;
}
sql += `\nCREATE SCHEMA IF NOT EXISTS drizzle;\nREVOKE ALL ON SCHEMA drizzle FROM PUBLIC;\nCREATE TABLE drizzle.__drizzle_migrations (id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint);\n`;
for (const { hash, when } of hashes) sql += `INSERT INTO drizzle.__drizzle_migrations (hash, created_at) VALUES ('${hash}', ${when});\n`;
sql += "COMMIT;\n";
await mkdir(new URL("supabase/", root), { recursive: true });
await writeFile(new URL("supabase/fresh-install.sql", root), sql);
console.log(`Generated ${hashes.length} ordered migrations and matching Drizzle history.`);
