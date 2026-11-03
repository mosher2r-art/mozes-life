import { describe, expect, it } from "vitest";
import { AssetMetadataEdit, parseEmbedUrl } from "./media-v2-policy";
describe("media metadata and approved video providers", () => {
  it("never fills omitted PATCH fields with defaults or changes unrelated rights",()=>{expect(AssetMetadataEdit.parse({})).toEqual({});expect(AssetMetadataEdit.parse({altText:"תיאור חדש"})).toEqual({altText:"תיאור חדש"});});
  it("does not accept imported medical approval or embed descriptors as metadata edits", () => {
    expect(AssetMetadataEdit.safeParse({ medicalStatus: "approved" }).success).toBe(false);
    expect(AssetMetadataEdit.safeParse({ reviewedBy: "admin" }).success).toBe(false);
    expect(AssetMetadataEdit.safeParse({ embed: { provider: "youtube", videoId: "abcdefghijk" } }).success).toBe(false);
  });
  it("canonicalizes YouTube and Vimeo links without accepting arbitrary origins", () => {
    expect(parseEmbedUrl("https://youtu.be/abcdefghijk")).toEqual({ provider: "youtube", videoId: "abcdefghijk" });
    expect(parseEmbedUrl("https://player.vimeo.com/video/123456")).toEqual({ provider: "vimeo", videoId: "123456" });
    expect(parseEmbedUrl("https://vimeo.com/123456/AbC123")).toEqual({ provider: "vimeo", videoId: "123456", hash: "AbC123" });
    for (const url of ["http://youtu.be/abcdefghijk", "https://youtube.com.attacker.test/watch?v=abcdefghijk", "https://user:pass@youtu.be/abcdefghijk", "javascript:alert(1)"]) expect(parseEmbedUrl(url)).toBeNull();
  });
});
