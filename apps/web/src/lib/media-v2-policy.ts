import { z } from "zod";
export const AssetMetadata = z.object({
  altText: z.string().max(300).default(""), source: z.string().max(2000).default(""),
  licenseType: z.string().max(200).default("unknown"), commercialUseAllowed: z.boolean().nullable().default(null),
  creditRequired: z.boolean().default(false), creditText: z.string().max(1000).default(""), editingAllowed: z.boolean().nullable().default(null),
  medicalStatus: z.enum(["draft", "approved", "rejected"]).default("draft"), reviewedBy: z.string().optional(), reviewedAt: z.string().datetime({ offset: true }).optional(),
  width: z.number().int().positive().max(100000).optional(), height: z.number().int().positive().max(100000).optional(), durationMs: z.number().int().min(0).max(86_400_000).optional(),
  embed: z.object({ provider: z.enum(["youtube", "vimeo"]), videoId: z.string().regex(/^[A-Za-z0-9_-]{1,32}$/), hash: z.string().regex(/^[A-Za-z0-9]{1,64}$/).optional() }).strict().optional(),
}).strict();
export type AssetMetadata = z.infer<typeof AssetMetadata>;
/** Review stamps and provider descriptors are always set by server-owned actions. */
// A PATCH must preserve omitted fields. Zod defaults inside .partial() would otherwise
// populate missing rights fields and turn an empty reviewer PATCH into an edit.
export const AssetMetadataEdit = z.object({
  altText:AssetMetadata.shape.altText.removeDefault().optional(),source:AssetMetadata.shape.source.removeDefault().optional(),
  licenseType:AssetMetadata.shape.licenseType.removeDefault().optional(),commercialUseAllowed:AssetMetadata.shape.commercialUseAllowed.removeDefault().optional(),
  creditRequired:AssetMetadata.shape.creditRequired.removeDefault().optional(),creditText:AssetMetadata.shape.creditText.removeDefault().optional(),
  editingAllowed:AssetMetadata.shape.editingAllowed.removeDefault().optional(),width:AssetMetadata.shape.width,height:AssetMetadata.shape.height,durationMs:AssetMetadata.shape.durationMs,
}).strict();
export const DeviceInput = z.object({ name: z.string().trim().min(1).max(200), manufacturer: z.string().trim().min(1).max(200), deviceType: z.enum(["semi_automatic", "fully_automatic"]), manualUrl: z.string().url().refine(v => new URL(v).protocol === "https:", "נדרש קישור HTTPS למדריך היצרן") }).strict();
export function parseEmbedUrl(value: string): NonNullable<AssetMetadata["embed"]> | null {
  try {
    const url = new URL(value); if (url.protocol !== "https:" || url.username || url.password) return null;
    const host = url.hostname.toLowerCase(), parts = url.pathname.split("/").filter(Boolean);
    if (["youtube.com", "www.youtube.com", "m.youtube.com", "youtube-nocookie.com", "www.youtube-nocookie.com", "youtu.be"].includes(host)) {
      const id = host === "youtu.be" ? parts[0] : parts[0] === "watch" ? url.searchParams.get("v") : ["embed", "shorts"].includes(parts[0] ?? "") ? parts[1] : null;
      return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? { provider: "youtube", videoId: id } : null;
    }
    if (["vimeo.com", "www.vimeo.com", "player.vimeo.com"].includes(host)) { const playerPath = parts[0] === "video", id = playerPath ? parts[1] : parts[0], hash = url.searchParams.get("h") ?? (playerPath ? undefined : parts[1]); if (!id || !/^\d{1,20}$/.test(id)) return null; return { provider: "vimeo", videoId: id, ...(hash && /^[A-Za-z0-9]{1,64}$/.test(hash) ? { hash } : {}) }; }
  } catch { /* Invalid URLs are rejected, never fetched. */ }
  return null;
}
