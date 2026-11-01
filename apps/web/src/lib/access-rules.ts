/** Pure access rules (no database), shared by the server and tests. */

export type AccessState = "active" | "scheduled" | "expired" | "revoked";

export function stateOf(g: { validFrom: string; validUntil: string | null; revokedAt: Date | null }, today: string): AccessState {
  if (g.revokedAt) return "revoked";
  if (g.validFrom > today) return "scheduled";
  if (g.validUntil && g.validUntil < today) return "expired";
  return "active";
}

export interface PersonLine {
  line: number;
  raw: string;
  name: string;
  email: string;
}

/** Accepts "email", "name, email", "name<TAB>email" or "email, name" — one person per line. */
export function parsePeople(text: string): { people: PersonLine[]; invalid: { line: number; raw: string }[] } {
  const people: PersonLine[] = [];
  const invalid: { line: number; raw: string }[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).forEach((rawLine, i) => {
    const raw = rawLine.trim();
    if (!raw) return;
    const parts = raw.split(/[,\t;]+/).map((p) => p.trim()).filter(Boolean);
    const emailIdx = parts.findIndex((p) => /^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$/.test(p.replace(/^<|>$/g, "")));
    if (emailIdx < 0 || parts.length > 3) {
      invalid.push({ line: i + 1, raw });
      return;
    }
    const email = parts[emailIdx]!.replace(/^<|>$/g, "").toLowerCase();
    if (seen.has(email)) return;
    seen.add(email);
    const name = parts.filter((_, j) => j !== emailIdx).join(" ").trim() || email.split("@")[0]!;
    people.push({ line: i + 1, raw, name: name.slice(0, 120), email });
  });
  return { people, invalid };
}

