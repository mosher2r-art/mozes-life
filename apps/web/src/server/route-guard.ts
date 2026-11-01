import "server-only";
import { NextResponse } from "next/server";
import { type Action, can } from "@mozes/authz";
import { type CurrentUser, getCurrentUser } from "./actor";

export const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
export const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/** Resolves the caller and checks a permission; returns a ready error response otherwise. */
export async function guard(action: Action): Promise<{ user: CurrentUser } | { response: Response }> {
  const user = await getCurrentUser();
  if (!user) return { response: json({ error: "unauthenticated" }, 401) };
  if (!can(user.actor, action)) return { response: json({ error: "forbidden" }, 403) };
  return { user };
}

export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    return undefined;
  }
}
