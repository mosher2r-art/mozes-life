import { describe, expect, it } from "vitest";
import { canonicalJson, contentHash } from "./content-hash";

describe("contentHash", () => {
  it("ignores key order and undefined values", () => {
    expect(contentHash({ b: 1, a: [{ y: 2, x: 1 }], u: undefined })).toBe(contentHash({ a: [{ x: 1, y: 2 }], b: 1 }));
  });
  it("is sensitive to values and array order", () => {
    expect(contentHash({ a: [1, 2] })).not.toBe(contentHash({ a: [2, 1] }));
    expect(canonicalJson({ a: "x" })).toBe('{"a":"x"}');
  });
});
