import "server-only";
import { NextResponse } from "next/server";
import { type Action, can, type Resource } from "@mozes/authz";
import { type CurrentUser, getCurrentUser } from "./actor";

type Handler = (user: CurrentUser, req: Request) => Promise<Response> | Response;

/** Wraps an API route handler with authentication + server-side authorization. */
export function withPermission(action: Action, handler: Handler, resource?: (req: Request) => Resource) {
  return async (req: Request): Promise<Response> => {
    const user = await getCurrentUser();
    if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
    if (!can(user.actor, action, resource?.(req))) {
      return NextResponse.json({ error: "forbidden" }, { status: 403 });
    }
    return handler(user, req);
  };
}
