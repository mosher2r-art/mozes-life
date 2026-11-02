import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { Pool } from "pg";
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";

const connectionString = process.env.SQL_TEST_DATABASE_URL;
if (!connectionString || !new URL(connectionString).pathname.endsWith("_test")) throw new Error("SQL_TEST_DATABASE_URL must name a dedicated empty *_test database");
const pool = new Pool({ connectionString });
const sql = await readFile(new URL("../../../supabase/fresh-install.sql", import.meta.url), "utf8");
try {
  const { rows: existing } = await pool.query("select tablename from pg_tables where schemaname in ('public','drizzle')");
  assert.equal(existing.length, 0, "Refusing to change a nonempty database");
  // These emulate Supabase API roles only inside the explicitly selected test cluster.
  for (const role of ["anon", "authenticated", "service_role"]) {
    if (!(await pool.query("select 1 from pg_roles where rolname=$1", [role])).rowCount) await pool.query(`CREATE ROLE ${role} NOLOGIN`);
  }
  await pool.query(sql);
  const { rows: tables } = await pool.query("select tablename from pg_tables where schemaname='public' order by tablename");
  assert.equal(tables.length, 19);
  for (const { tablename } of tables) {
    for (const role of ["anon", "authenticated", "service_role"]) {
      const { rows } = await pool.query("select has_table_privilege($1, $2, 'SELECT,INSERT,UPDATE,DELETE') as allowed", [role, `public.\"${tablename}\"`]);
      assert.equal(rows[0].allowed, false, `${role} can access ${tablename}`);
    }
  }
  assert.equal((await pool.query("select count(*)::int as n from pg_tables where schemaname='public' and rowsecurity")).rows[0].n, 19);
  const before = (await pool.query("select count(*)::int as n from drizzle.__drizzle_migrations")).rows[0].n;
  await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL("../drizzle", import.meta.url)) });
  assert.equal((await pool.query("select count(*)::int as n from drizzle.__drizzle_migrations")).rows[0].n, before);
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE mozes_app");
    await client.query(`INSERT INTO public.\"user\" (id,name,email) VALUES ('sql-verification','test','sql-test@example.invalid')`);
    assert.equal((await client.query(`SELECT id FROM public.\"user\" WHERE id='sql-verification'`)).rowCount, 1);
    await client.query("ROLLBACK");
  } finally { client.release(); }
  await assert.rejects(pool.query(sql), /already initialized/);
  // A failed explicit transaction leaves the pooled client in aborted state.
  await pool.query("ROLLBACK");
  console.log(JSON.stringify({ tables:19, rls:19, apiRoleDenials:57, migrations:before, serverRoleReadWrite:true, migratorNoOp:true, reinstallationRejected:true }));
} finally { await pool.end(); }
