import type { PoolConfig } from "pg";
import { supabaseCa } from "./supabase-ca";

/** Supabase signs database/pooler certificates with its own published CA.
 * Keep hostname verification enabled and avoid pg's URL SSL options replacing
 * an explicit TLS configuration. Other PostgreSQL providers stay unchanged. */
export function postgresConfig(connectionString: string): PoolConfig {
  const url = new URL(connectionString);
  const supabase = /^(?:[a-z0-9-]+\.pooler\.supabase\.com|db\.[a-z0-9]+\.supabase\.co)$/.test(url.hostname);
  if (!supabase || url.searchParams.get("sslmode") !== "verify-full") return { connectionString };
  for (const key of ["sslrootcert", "sslcert", "sslkey", "uselibpqcompat"]) {
    if (url.searchParams.has(key)) throw new Error("Supabase verify-full uses the bundled official CA; remove conflicting SSL URL parameters");
  }
  url.searchParams.delete("sslmode");
  return { connectionString: url.toString(), ssl: { ca: supabaseCa, rejectUnauthorized: true } };
}
