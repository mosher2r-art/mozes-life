"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function NewCourseForm() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  return (
    <form
      className="block new-course"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setError(null);
        const res = await fetch("/api/studio/courses", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ title }) });
        const body = (await res.json().catch(() => ({}))) as { id?: string; message?: string };
        if (res.ok && body.id) router.push(`/studio/courses/${body.id}`);
        else {
          setPending(false);
          setError(body.message ?? "יצירת הקורס נכשלה");
        }
      }}
    >
      <div className="field">
        <label htmlFor="new-course-title">קורס חדש</label>
        <input id="new-course-title" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="למשל: החייאה ושימוש בדפיברילטור" required minLength={2} maxLength={160} />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending || title.trim().length < 2}>{pending ? "יוצר…" : "יצירת קורס"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}
