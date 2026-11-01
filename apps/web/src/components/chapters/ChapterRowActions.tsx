"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function ChapterRowActions({ id, title, used, canCreate, canEdit }: { id: string; title: string; used: number; canCreate: boolean; canEdit: boolean }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function duplicate() {
    setBusy(true);
    const res = await fetch(`/api/studio/chapters/${id}/duplicate`, { method: "POST" });
    const body = (await res.json().catch(() => ({}))) as { id?: string };
    setBusy(false);
    if (res.ok && body.id) router.push(`/studio/chapters/${body.id}`);
    else setError("השכפול נכשל");
  }
  async function remove() {
    setBusy(true);
    const res = await fetch(`/api/studio/chapters/${id}`, { method: "DELETE" });
    const body = (await res.json().catch(() => ({}))) as { message?: string };
    setBusy(false);
    setConfirm(false);
    if (res.ok) router.refresh();
    else setError(body.message ?? "המחיקה נכשלה");
  }

  return (
    <>
      <a className="btn btn-quiet btn-sm" href={`/studio/chapters/${id}`}>עריכה</a>
      {canCreate && <button type="button" className="btn btn-quiet btn-sm" disabled={busy} onClick={duplicate}>שכפול</button>}
      <a className="btn btn-quiet btn-sm" href={`/api/studio/chapters/${id}/export`} download>הורדה</a>
      {canEdit && used === 0 && (confirm ? (
        <>
          <button type="button" className="btn btn-danger btn-sm" disabled={busy} onClick={remove} aria-label={`אישור מחיקת ${title}`}>מחיקה סופית</button>
          <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirm(false)}>ביטול</button>
        </>
      ) : (
        <button type="button" className="btn btn-quiet btn-sm ed-danger-text" onClick={() => setConfirm(true)} aria-label={`מחיקת ${title}`}>מחיקה</button>
      ))}
      {error && <span className="form-error" role="alert">{error}</span>}
    </>
  );
}
