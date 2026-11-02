import "server-only";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { env } from "@/lib/env";
import * as schema from "./schema";
import { workerPool } from "./worker-pool";
import { postgresConfig } from "./postgres-config";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { workerPostgresConfig } from "./worker-postgres-config";

const globalForDb = globalThis as unknown as { __mozesPool?: Pool };

// Reuse a single pool across hot reloads in development.
const pool =
  process.env.DEPLOY_TARGET === "cloudflare" ? workerPool(() => {
    const bindings = getCloudflareContext().env as { HYPERDRIVE?: { connectionString: string } };
    return { ...workerPostgresConfig(env().DATABASE_URL, bindings.HYPERDRIVE), connectionTimeoutMillis: 10_000 };
  }) : globalForDb.__mozesPool ??
  new Pool({ ...postgresConfig(env().DATABASE_URL), max: 10, idleTimeoutMillis: 30_000 });
if (process.env.NODE_ENV !== "production") globalForDb.__mozesPool = pool;

export const db = drizzle(pool, { schema });
export { pool };
