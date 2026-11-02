import { describe, expect, it } from "vitest";
import { workerPool } from "./worker-pool";
import { drizzle } from "drizzle-orm/node-postgres";
import { sql } from "drizzle-orm";

const url = process.env.TEST_DATABASE_URL;
describe.skipIf(!url)("Worker database connection lifecycle", () => {
  it("keeps transactions on one socket, isolates concurrent transactions and recovers after rollback", async () => {
    if (!url || !new URL(url).pathname.endsWith("_test")) throw new Error("A dedicated *_test database is required");
    const pool = workerPool({ connectionString: url });
    const db = drizzle(pool);
    const run = () => db.transaction(async tx => {
      await tx.execute(sql`create temporary table worker_transaction_probe (n int) on commit drop`);
      await tx.execute(sql`insert into worker_transaction_probe values (7)`);
      const result = await tx.execute(sql`select n, pg_backend_pid() as pid from worker_transaction_probe`);
      expect(result.rows[0]?.n).toBe(7);
      await tx.execute(sql`select pg_sleep(0.05)`);
      return result.rows[0]?.pid;
    });
    const pids = await Promise.all([run(), run()]);
    expect(pids[0]).not.toBe(pids[1]);
    await expect(db.transaction(async tx => { await tx.execute(sql`select 1/0`); })).rejects.toThrow();
    expect((await pool.query("select 1 as n")).rows[0].n).toBe(1);
    await pool.end();
  });
});
