import { orgReport } from "@/server/org-portal";
import { guardOrg } from "@/server/route-guard";

export const dynamic = "force-dynamic";
const STATUS: Record<string, string> = { not_started: "טרם התחיל", in_progress: "בתהליך", completed: "הושלם", passed: "עבר", failed: "לא עבר" };
const cell = (v: string | number | null | undefined) => `"${String(v ?? "").replace(/"/g, '""')}"`;

/** Progress report for Excel (UTF-8 with BOM so Hebrew opens correctly). */
export async function GET(_req: Request, ctx: { params: Promise<{ orgId: string }> }) {
  const { orgId } = await ctx.params;
  const g = await guardOrg("org.view_progress", orgId);
  if ("response" in g) return g.response;
  const r = await orgReport(orgId);
  const lines = [["שם", "אימייל", "קורס", "מצב", "התקדמות %", "ציון", "מספר תעודה"].map(cell).join(",")];
  for (const m of r.members)
    for (const c of r.courses) {
      const p = r.progress[m.id]?.[c.id];
      lines.push([m.name, m.email, c.title, p ? STATUS[p.status] : "טרם התחיל", p?.progress ?? 0, p?.score, p?.certificate].map(cell).join(","));
    }
  return new Response(`﻿${lines.join("\r\n")}`, {
    headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": 'attachment; filename="mozes-life-report.csv"', "cache-control": "no-store" },
  });
}
