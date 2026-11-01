import { NextResponse } from "next/server";
import { getCurrentUser } from "@/server/actor";
import { CmiPayload, savePackageData } from "@/server/learning";
import { ID_RE, readJson } from "@/server/route-guard";

export const dynamic = "force-dynamic";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const user = await getCurrentUser();
  if (!user) return NextResponse.json({ error: "unauthenticated" }, { status: 401 });
  const { id } = await ctx.params;
  if (!ID_RE.test(id)) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const parsed = CmiPayload.safeParse(await readJson(req));
  if (!parsed.success) return NextResponse.json({ error: "invalid" }, { status: 400 });
  const ok = await savePackageData(user.actor.userId, id, parsed.data.cmi, parsed.data.complete ?? false);
  return ok ? NextResponse.json({ ok: true }) : NextResponse.json({ error: "not_found" }, { status: 404 });
}
