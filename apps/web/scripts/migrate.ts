/** Applies pending SQL migrations from ./drizzle. Usage: pnpm db:migrate */
import { drizzle } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("DATABASE_URL is not set");
  process.exit(1);
}
const pool = new Pool({ connectionString: url });
try {
  await migrate(drizzle(pool), { migrationsFolder: new URL("../drizzle", import.meta.url).pathname });
  console.log("Migrations applied.");
} finally {
  await pool.end();
}
