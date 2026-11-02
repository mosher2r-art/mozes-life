import { afterEach, describe, expect, it, vi } from "vitest";
import { servePublicStorage } from "../../../../infra/media-proxy/worker";

const env = { SUPABASE_PUBLIC_BUCKET_URL: "https://project.supabase.co/storage/v1/object/public/mozes-media", APP_ORIGIN: "https://app.example.org" };
afterEach(() => vi.restoreAllMocks());
describe("isolated Supabase courseware delivery", () => {
  it("streams the unchanged HTML with an executable MIME type on the separate origin", async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response("<html>lesson</html>", { headers: { "content-type": "text/plain", "content-security-policy": "sandbox", "x-frame-options": "DENY" } }));
    const response = await servePublicStorage(new Request("https://media.example.org/packages/p-1/index.html"), env, upstream);
    expect(await response.text()).toBe("<html>lesson</html>");
    expect(response.headers.get("content-type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("content-security-policy")).toContain("frame-ancestors 'self' https://app.example.org");
    expect(response.headers.get("x-frame-options")).toBeNull();
    expect(upstream).toHaveBeenCalledWith(expect.stringContaining("/public/mozes-media/packages/p-1/index.html"), expect.objectContaining({ redirect: "manual" }));
  });
  it("never forwards cookies or authorization and preserves byte ranges", async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response("a", { status: 206, headers: { "content-range": "bytes 0-0/10" } }));
    const response = await servePublicStorage(new Request("https://media.example.org/video/2026/a.mp4", { headers: { cookie: "session=private", authorization: "Bearer private", range: "bytes=0-0" } }), env, upstream);
    const sent = upstream.mock.calls[0]![1]!.headers as Headers;
    expect(sent.get("cookie")).toBeNull(); expect(sent.get("authorization")).toBeNull();
    expect(sent.get("range")).toBe("bytes=0-0"); expect(response.status).toBe(206);
    expect(response.headers.get("content-range")).toBe("bytes 0-0/10");
  });
  it("refuses upload requests, private import archives, and encoded traversal", async () => {
    const upstream = vi.fn<typeof fetch>();
    for (const request of [new Request("https://media.example.org/image/a.png", { method: "PUT" }), new Request("https://media.example.org/imports/a.zip"), new Request("https://media.example.org/packages/%2e%2e%2fprivate")]) {
      expect((await servePublicStorage(request, env, upstream)).status).toBeGreaterThanOrEqual(400);
    }
    expect(upstream).not.toHaveBeenCalled();
  });
  it("rejects arbitrary upstream hosts rather than becoming an open proxy", async () => {
    const upstream = vi.fn<typeof fetch>();
    expect((await servePublicStorage(new Request("https://media.example.org/image/a.png"), { ...env, SUPABASE_PUBLIC_BUCKET_URL: "https://other.example.org/files" }, upstream)).status).toBe(503);
    expect(upstream).not.toHaveBeenCalled();
  });
  it("refuses redirects from storage instead of forwarding requests to another host", async () => {
    const upstream = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 307, headers: { Location: "https://other.example.org/private" } }));
    expect((await servePublicStorage(new Request("https://media.example.org/image/a.png"), env, upstream)).status).toBe(502);
    expect(upstream).toHaveBeenCalledTimes(1);
  });
});
