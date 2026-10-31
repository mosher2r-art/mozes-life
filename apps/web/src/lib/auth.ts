import "server-only";
import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { nextCookies } from "better-auth/next-js";
import { db } from "@/db";
import * as schema from "@/db/schema";
import { env } from "./env";

export const auth = betterAuth({
  appName: "MOZES LIFE",
  baseURL: env().BETTER_AUTH_URL,
  secret: env().BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: {
      user: schema.user,
      session: schema.session,
      account: schema.account,
      verification: schema.verification,
    },
  }),
  emailAndPassword: {
    enabled: true,
    // Accounts are created by administrators/invitations only — no public self sign-up.
    disableSignUp: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
  },
  session: {
    expiresIn: 60 * 60 * 24 * 7, // 7 days
    updateAge: 60 * 60 * 24, // refresh daily
  },
  rateLimit: {
    enabled: env().NODE_ENV !== "test",
    window: 60,
    max: 100,
    customRules: { "/sign-in/email": { window: 60, max: env().AUTH_SIGNIN_RATE_LIMIT_PER_MIN } },
  },
  advanced: {
    useSecureCookies: env().NODE_ENV === "production",
  },
  telemetry: { enabled: false },
  plugins: [nextCookies()], // must stay last
});
