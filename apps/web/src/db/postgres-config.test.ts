import { describe, expect, it } from "vitest";
import { postgresConfig } from "./postgres-config";

describe("Supabase certificate verification", () => {
  it("trusts the official CA while retaining certificate and hostname verification", () => {
    const result = postgresConfig("postgresql://app:placeholder@aws-0-eu-west-1.pooler.supabase.com:6543/postgres?sslmode=verify-full&application_name=mozes");
    expect(result.ssl).toMatchObject({ rejectUnauthorized: true });
    expect(result.ssl && typeof result.ssl === "object" && result.ssl.ca).toContain("-----BEGIN CERTIFICATE-----");
    expect(result.connectionString).not.toContain("sslmode");
    expect(result.connectionString).toContain("application_name=mozes");
  });
  it("does not extend the Supabase trust exception to unrelated hosts", () => {
    const url = "postgresql://app:placeholder@pooler.supabase.com.example.org/db?sslmode=verify-full";
    expect(postgresConfig(url)).toEqual({ connectionString: url });
  });
  it("rejects URL options that could override the explicit TLS configuration", () => {
    expect(() => postgresConfig("postgresql://app:placeholder@db.project.supabase.co/postgres?sslmode=verify-full&sslrootcert=other.pem")).toThrow("conflicting SSL");
  });
});
