"use client";
import { createAuthClient } from "better-auth/react";

// Same-origin: no baseURL needed.
export const authClient = createAuthClient();
