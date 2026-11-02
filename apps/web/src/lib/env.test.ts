import { afterEach, beforeEach, expect, it, vi } from "vitest";
beforeEach(() => {
  vi.resetModules();
  vi.stubEnv("DEPLOY_TARGET", "cloudflare");
  vi.stubEnv("BETTER_AUTH_URL", "https://development.example.invalid");
  vi.stubEnv("BETTER_AUTH_SECRET", "test-only-secret-at-least-32-characters");
});
afterEach(() => vi.unstubAllEnvs());
it("requires verified TLS for a remote Worker database", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://test:test@db.example.invalid/postgres");
  const { env } = await import("./env");
  expect(() => env()).toThrow(/sslmode=verify-full/);
});
it("accepts verified TLS without connecting or disclosing credentials", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://test:test@db.example.invalid/postgres?sslmode=verify-full");
  const { env } = await import("./env");
  expect(env().BETTER_AUTH_URL).toBe("https://development.example.invalid");
});
it("allows a loopback database for workerd preview", async () => {
  vi.stubEnv("DATABASE_URL", "postgres://test:test@127.0.0.1:55432/preview_test");
  const { env } = await import("./env");
  expect(env().DATABASE_URL).toContain("127.0.0.1");
});
