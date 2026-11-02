import { describe, expect, it } from "vitest";
import { workerPostgresConfig } from "./worker-postgres-config";

describe("Worker database transport selection", () => {
  const origin = "postgresql://app:placeholder@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=verify-full";
  it("retains verified upstream TLS when no Hyperdrive binding exists", () => {
    expect(workerPostgresConfig(origin).ssl).toMatchObject({ rejectUnauthorized: true });
  });
  it("uses only the platform binding for the internal Hyperdrive connection", () => {
    const binding = { connectionString: "postgresql://internal:placeholder@hyperdrive.local:5432/postgres" };
    expect(workerPostgresConfig(origin, binding)).toEqual({ connectionString: binding.connectionString, ssl: false });
  });
});
