import { getImport, MAX_PACKAGE_BYTES } from "@/server/importer";
import { guard, ID_RE, json } from "@/server/route-guard";
import { driver, writeLocal } from "@/server/storage";

export const dynamic = "force-dynamic";

/** Upload target for the local (development/test) storage driver only. */
export async function PUT(req: Request, ctx: { params: Promise<{ id: string }> }) {
  if (driver() !== "local") return json({ error: "not_found" }, 404);
  const g = await guard("course.import");
  if ("response" in g) return g.response;
  const { id } = await ctx.params;
  if (!ID_RE.test(id) || !req.body) return json({ error: "not_found" }, 404);
  const job = await getImport(id);
  if (!job || job.status !== "uploading") return json({ error: "not_found" }, 404);
  try {
    await writeLocal(job.storageKey, req.body, MAX_PACKAGE_BYTES);
  } catch {
    return json({ error: "too_large" }, 413);
  }
  return new Response(null, { status: 200 });
}
