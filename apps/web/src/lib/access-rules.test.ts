import { describe, expect, it } from "vitest";
import { parsePeople, stateOf } from "./access-rules";

describe("parsePeople", () => {
  it("accepts emails, 'name, email', tab-separated and 'email, name' lines", () => {
    const { people, invalid } = parsePeople("dana@example.com\nיוסי כהן, Yossi@Example.com\nרות לוי\truth@example.com\nmoshe@example.com, משה\n");
    expect(people.map((p) => [p.name, p.email])).toEqual([
      ["dana", "dana@example.com"],
      ["יוסי כהן", "yossi@example.com"],
      ["רות לוי", "ruth@example.com"],
      ["משה", "moshe@example.com"],
    ]);
    expect(invalid).toEqual([]);
  });

  it("reports invalid lines with their line numbers and skips duplicates", () => {
    const { people, invalid } = parsePeople("a@b.co\nלא אימייל\nA@B.co\n\nx@y");
    expect(people).toHaveLength(1);
    expect(invalid).toEqual([{ line: 2, raw: "לא אימייל" }, { line: 5, raw: "x@y" }]);
  });
});

describe("stateOf", () => {
  const today = "2026-11-01";
  it("classifies access windows by calendar day (inclusive)", () => {
    expect(stateOf({ validFrom: "2026-11-01", validUntil: "2026-11-01", revokedAt: null }, today)).toBe("active");
    expect(stateOf({ validFrom: "2026-10-01", validUntil: null, revokedAt: null }, today)).toBe("active");
    expect(stateOf({ validFrom: "2026-11-02", validUntil: null, revokedAt: null }, today)).toBe("scheduled");
    expect(stateOf({ validFrom: "2026-08-01", validUntil: "2026-10-31", revokedAt: null }, today)).toBe("expired");
    expect(stateOf({ validFrom: "2026-08-01", validUntil: null, revokedAt: new Date() }, today)).toBe("revoked");
  });
});
