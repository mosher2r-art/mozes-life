import { NextResponse } from "next/server";
import { pool } from "@/db";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    await pool.query("select 1");
    return NextResponse.json({ status: "ok", db: "ok" });
  } catch {
    // Never leak connection details.
    return NextResponse.json({ status: "degraded", db: "unreachable" }, { status: 503 });
  }
}
