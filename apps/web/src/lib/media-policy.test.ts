import { afterEach, describe, expect, it, vi } from "vitest";
import { checkDeclared, MEDIA_TYPES } from "./media-policy";

const bytes = (...xs: (number | string)[]) => new Uint8Array(xs.flatMap((x) => (typeof x === "string" ? [...x].map((c) => c.charCodeAt(0)) : [x])));
const type = (mime: string) => MEDIA_TYPES.find((t) => t.mime === mime)!;
afterEach(() => vi.unstubAllEnvs());

describe("checkDeclared", () => {
  it("rejects media above the deployed storage limit before uploading", () => {
    vi.stubEnv("NEXT_PUBLIC_MEDIA_MAX_BYTES", String(50 * 1024 ** 2));
    expect(checkDeclared("video.mp4", "video/mp4", 49 * 1024 ** 2).ok).toBe(true);
    expect(checkDeclared("video.mp4", "video/mp4", 51 * 1024 ** 2)).toMatchObject({ ok: false, message: expect.stringContaining("50MB") });
    expect(checkDeclared("photo.png", "image/png", 16 * 1024 ** 2).ok).toBe(false);
  });
  it("accepts supported files", () => {
    expect(checkDeclared("aed.mp4", "video/mp4", 5_000_000).ok).toBe(true);
    expect(checkDeclared("Lobby.JPG", "image/jpeg", 200_000).ok).toBe(true);
    expect(checkDeclared("subs.vtt", "", 300).ok).toBe(true);
  });
  it("rejects unsupported, mismatched, empty and oversized files", () => {
    expect(checkDeclared("evil.svg", "image/svg+xml", 10).ok).toBe(false);
    expect(checkDeclared("run.exe", "application/octet-stream", 10).ok).toBe(false);
    expect(checkDeclared("fake.mp4", "text/html", 10).ok).toBe(false);
    expect(checkDeclared("a.png", "image/png", 0).ok).toBe(false);
    expect(checkDeclared("big.png", "image/png", 16 * 1024 * 1024).ok).toBe(false);
  });
});

describe("magic bytes", () => {
  it("recognise real signatures and reject impostors", () => {
    expect(type("image/png").magic(bytes(0x89, "PNG", 0x0d, 0x0a, 0x1a, 0x0a))).toBe(true);
    expect(type("image/png").magic(bytes("<html>"))).toBe(false);
    expect(type("video/mp4").magic(bytes(0, 0, 0, 0x20, "ftypisom"))).toBe(true);
    expect(type("video/mp4").magic(bytes("<script>alert(1)"))).toBe(false);
    expect(type("image/webp").magic(bytes("RIFF", 0, 0, 0, 0, "WEBP"))).toBe(true);
    expect(type("text/vtt").magic(bytes(0xef, 0xbb, 0xbf, "WEBVTT"))).toBe(true);
    expect(type("text/vtt").magic(bytes("<b>x</b>"))).toBe(false);
  });
});
