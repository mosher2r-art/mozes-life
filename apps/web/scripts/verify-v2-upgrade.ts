import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const url = process.env.SQL_TEST_DATABASE_URL;
if (!url || !new URL(url).pathname.endsWith("_test")) throw Error("An explicitly isolated *_test database is required");
const pool = new Pool({ connectionString: url });
try {
  assert.equal((await pool.query("select 1 from pg_tables where schemaname in ('public','drizzle')")).rowCount, 0, "Refusing to alter a nonempty database");
  const fresh = await readFile(new URL("../../../supabase/fresh-install.sql", import.meta.url), "utf8");
  const boundary = fresh.indexOf("-- 0011_schema_v2\n"); assert.ok(boundary > 0);
  await pool.query(`${fresh.slice(0, boundary)}\nCOMMIT;`);
  await pool.query("CREATE SCHEMA drizzle; CREATE TABLE drizzle.__drizzle_migrations(id SERIAL PRIMARY KEY, hash text NOT NULL, created_at bigint)");
  const migrations = new URL("../drizzle/", import.meta.url), journal = JSON.parse(await readFile(new URL("meta/_journal.json", migrations), "utf8"));
  for (const entry of journal.entries.filter((e: { idx: number }) => e.idx < 11)) {
    const source = await readFile(new URL(`${entry.tag}.sql`, migrations), "utf8");
    await pool.query("INSERT INTO drizzle.__drizzle_migrations(hash,created_at) VALUES($1,$2)", [createHash("sha256").update(source).digest("hex"), entry.when]);
  }
  const content = { schema: "mozes-course", schemaVersion: 1, id: "sql-v1", title: "Preserved legacy chapter", units: [{ id: "u", title: "Unit", kind: "lesson", screens: [{ id: "s", title: "Screen", template: "text", slots: { body: [{ id: "p", type: "richText", body: [{ kind: "paragraph", content: [{ text: "Original", bold: true }] }] }] } }] }] };
  await pool.query('INSERT INTO public."user"(id,name,email) VALUES($1,$2,$3)', ["v2-upgrade-reviewer", "Test reviewer", "upgrade@example.invalid"]);
  await pool.query("INSERT INTO chapter(id,title,content) VALUES($1,$2,$3)", ["v2-upgrade-chapter", "Legacy", content]);
  await pool.query("INSERT INTO asset(id,kind,status,filename,mime,size_bytes,storage_key) VALUES('legacy-image','image','ready','legacy.png','image/png',8,'images/legacy.png')");
  const before = (await pool.query("SELECT content::text AS content FROM chapter WHERE id='v2-upgrade-chapter'")).rows[0].content;
  const upgrade=await readFile(new URL("../../../supabase/upgrade-v2.sql",import.meta.url),"utf8");
  await pool.query(upgrade);
  await assert.rejects(pool.query(upgrade),/history differs or upgrade already applied/);
  await pool.query("ROLLBACK");
  await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(migrations) });
  assert.equal(Number((await pool.query("SELECT count(*) AS n FROM drizzle.__drizzle_migrations")).rows[0].n),journal.entries.length);
  const after = (await pool.query("SELECT content::text AS content,revision,published_version_id FROM chapter WHERE id='v2-upgrade-chapter'")).rows[0];
  assert.equal(after.content, before); assert.equal(after.revision,1); assert.equal(after.published_version_id,null);
  const version = (await pool.query("SELECT * FROM asset_version WHERE asset_id='legacy-image'")).rows[0];
  assert.equal(version.private_storage,false); assert.equal(version.metadata.medicalStatus,"draft"); assert.equal(version.metadata.commercialUseAllowed,null);
  const client = await pool.connect();
  try {
  await client.query("SET ROLE mozes_app");
  await assert.rejects(client.query("UPDATE asset_version SET filename='mutated.png' WHERE asset_id='legacy-image'"), /immutable/);
  await assert.rejects(client.query("DELETE FROM asset_version WHERE asset_id='legacy-image'"), /permission denied/);
  await client.query("INSERT INTO chapter_version(id,chapter_id,version_no,content,content_hash,asset_manifest) VALUES('snapshot','v2-upgrade-chapter',1,'{}','test','{}')");
  await assert.rejects(client.query("UPDATE chapter_version SET content='[]' WHERE id='snapshot'"), /permission denied|immutable/);
  await assert.rejects(client.query("UPDATE screen_review SET note='forged'"), /permission denied/);
  await assert.rejects(client.query("INSERT INTO device_model(id,name,manufacturer,device_type,manual_url,status) VALUES('fake','Fake','Test','semi_automatic','https://example.invalid/manual','verified')"), /device_model_verified_evidence/);
  await client.query("INSERT INTO device_model(id,name,manufacturer,device_type,manual_url) VALUES('draft-device','Test fixture','Test','semi_automatic','https://example.invalid/manual')");
  } finally { await client.query("RESET ROLE"); client.release(); }
  console.log(JSON.stringify({ incrementalUpgrade:true, v1JsonUnchanged:true, draftRevisionUnchanged:true, legacyPublicLinkPreserved:true, noFabricatedApproval:true, readyVersionImmutable:true, publishedVersionImmutable:true, reviewAppendOnly:true, deviceRequiresHumanEvidence:true, migrations:journal.entries.length }));
} finally { await pool.end(); }
