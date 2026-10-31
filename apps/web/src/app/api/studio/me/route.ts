import { NextResponse } from "next/server";
import { withPermission } from "@/server/api";

export const dynamic = "force-dynamic";

export const GET = withPermission("studio.access", (user) =>
  NextResponse.json({ userId: user.actor.userId, platformRoles: user.actor.platformRoles }),
);
