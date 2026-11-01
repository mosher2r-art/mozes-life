"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

/** Creates a bank chapter. With onCreated, the caller decides what happens next (e.g. add it to a course). */
export function NewChapterForm({ onCreated, idPrefix = "new-chapter" }: { onCreated?: (c: { id: string; title: string; kind: "lesson" | "exam" }) => void; idPrefix?: string }) {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<"lesson" | "exam">("lesson");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="new-chapter"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        const res = await fetch("/api/studio/chapters", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title, kind }) });
        const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
        setPending(false);
        if (!res.ok || !body.id) return setError(body.message ?? "יצירת הפרק נכשלה");
        if (onCreated) {
          onCreated({ id: body.id, title: title.trim(), kind });
          setTitle("");
        } else router.push(`/studio/chapters/${body.id}`);
      }}
    >
      <div className="field">
        <label htmlFor={`${idPrefix}-title`}>שם הפרק</label>
        <input id={`${idPrefix}-title`} value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: זיהוי דום לב" required minLength={2} maxLength={120} />
      </div>
      <fieldset className="field radio-row">
        <legend>סוג</legend>
        <label><input type="radio" name={`${idPrefix}-kind`} checked={kind === "lesson"} onChange={() => setKind("lesson")} /> שיעור</label>
        <label><input type="radio" name={`${idPrefix}-kind`} checked={kind === "exam"} onChange={() => setKind("exam")} /> מבחן</label>
      </fieldset>
      <button className="btn btn-primary" type="submit" disabled={pending || title.trim().length < 2}>{pending ? "יוצר…" : "יצירת פרק"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
