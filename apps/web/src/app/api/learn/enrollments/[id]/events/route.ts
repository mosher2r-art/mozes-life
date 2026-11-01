import { NextResponse } from "next/server";
import { can } from "@mozes/authz";
import { EventBatchSchema } from "@mozes/player-core";
import { getCurrentUser } from "@/server/actor";
import { applyEvents } from "@/server/learning";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  if (!can(user.actor, "academy.access") && !can(user.actor, "studio.access"))
    return NextResponse.json({ error: "forbidden" }, { status: 403 });

  const { id } = await ctx.params;
  if (!/^[A-Za-z0-9_-]{1,64}$/.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "invalid_json" }, { status: 400 });
  }
  const parsed = EventBatchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: "invalid_events" }, { status: 400 });

  const result = await applyEvents(user.actor.userId, id, parsed.data.events);
  if (!result.ok && result.reason === "not_found") return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!result.ok) return NextResponse.json({ error: "rejected", code: result.code, state: result.state }, { status: 409 });
  return NextResponse.json({ ok: true, state: result.state });
}
