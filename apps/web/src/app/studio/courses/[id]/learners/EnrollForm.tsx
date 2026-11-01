"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

const ERR: Record<string, string> = { no_user: "לא נמצא משתמש עם האימייל הזה.", not_found: "הקורס לא נמצא." };

export function EnrollForm({ courseId }: { courseId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  return (
    <form
      className="block new-course"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setMsg(null);
        const res = await fetch(`/api/studio/courses/${courseId}/enrollments`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email }) });
        const body = (await res.json().catch(() => ({}))) as { created?: boolean; error?: string; message?: string };
        setPending(false);
        if (res.ok) {
          setMsg({ tone: "ok", text: body.created ? "הלומד שויך לקורס." : "הלומד כבר משויך לקורס." });
          setEmail("");
          router.refresh();
        } else setMsg({ tone: "bad", text: body.message ?? ERR[body.error ?? ""] ?? "השיוך נכשל." });
      }}
    >
      <div className="field">
        <label htmlFor="enroll-email">שיוך לומד לפי אימייל</label>
        <input id="enroll-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "משייך…" : "שיוך לקורס"}</button>
      {msg && <p className={msg.tone === "ok" ? "form-ok" : "form-error"} role={msg.tone === "ok" ? "status" : "alert"}>{msg.text}</p>}
    </form>
  );
}
