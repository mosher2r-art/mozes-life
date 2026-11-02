import type { PoolConfig } from "pg";
import { postgresConfig } from "./postgres-config";

/** Hyperdrive terminates the internal Worker socket and verifies TLS upstream.
 * Read its binding inside each request, never cache its generated credentials.
 * Disabling client SSL applies only to this platform binding, not DATABASE_URL. */
export function workerPostgresConfig(databaseUrl: string, hyperdrive?: { connectionString: string }): PoolConfig {
  if (hyperdrive) return { connectionString: hyperdrive.connectionString, ssl: false };
  return postgresConfig(databaseUrl);
}
