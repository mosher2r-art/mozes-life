import { z } from "zod";

/** Validated server environment. Import only from server code. */
const schema = z.object({
  DATABASE_URL: z.string().url(),
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  /** Sign-in attempts allowed per IP per minute. Raise only for automated test runs. */
  AUTH_SIGNIN_RATE_LIMIT_PER_MIN: z.coerce.number().int().min(1).max(1000).default(10),
});

function load() {
  // Hosting platforms such as Render expose the public URL themselves.
  const source = { ...process.env, BETTER_AUTH_URL: process.env.BETTER_AUTH_URL || process.env.RENDER_EXTERNAL_URL };
  const parsed = schema.safeParse(source);
  if (!parsed.success) {
    const issues = parsed.error.issues.map((i) => `  - ${i.path.join(".")}: ${i.message}`).join("\n");
    throw new Error(`Invalid environment configuration:\n${issues}`);
  }
  return parsed.data;
}

let cached: z.infer<typeof schema> | undefined;
export function env() {
  return (cached ??= load());
}
