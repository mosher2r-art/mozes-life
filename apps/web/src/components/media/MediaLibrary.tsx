"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ACCEPT_ATTR, formatBytes, KIND_LABEL, type AssetKind } from "@/lib/media-policy";

export type { AssetKind };
import { type AssetView, uploadFile } from "./upload";

interface Upload {
  name: string;
  progress: number;
  error?: string;
}

/**
 * Media library grid with drag-and-drop upload.
 * - mode "manage": full library page (alt text, delete).
 * - mode "pick": inside the editor; clicking a file selects it.
 */
export function MediaLibrary({
  mode,
  kinds,
  onPick,
  canManage,
}: {
  mode: "manage" | "pick";
  /** Restrict the list (and auto-pick after upload) to these kinds. */
  kinds?: AssetKind[];
  onPick?: (a: AssetView) => void;
  canManage: boolean;
}) {
  const [assets, setAssets] = useState<AssetView[] | null>(null);
  const [storage, setStorage] = useState<"r2" | "local" | "none">("r2");
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [drag, setDrag] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const load = useCallback(async () => {
    const res = await fetch("/api/studio/media");
    const body = (await res.json()) as { storage: "r2" | "local" | "none"; assets: AssetView[] };
    setStorage(body.storage);
    setAssets(kinds ? body.assets.filter((a) => kinds.includes(a.kind)) : body.assets);
  }, [kinds]);

  useEffect(() => {
    void load();
  }, [load]);

  async function handleFiles(files: FileList | File[]) {
    setMsg(null);
    for (const file of Array.from(files)) {
      setUploads((u) => [...u, { name: file.name, progress: 0 }]);
      const setP = (patch: Partial<Upload>) => setUploads((u) => u.map((x) => (x.name === file.name ? { ...x, ...patch } : x)));
      try {
        const a = await uploadFile(file, (p) => setP({ progress: p }));
        if (!kinds || kinds.includes(a.kind)) setAssets((list) => [a, ...(list ?? [])]);
        setUploads((u) => u.filter((x) => x.name !== file.name));
        if (mode === "pick" && onPick && (!kinds || kinds.includes(a.kind))) onPick(a);
      } catch (e) {
        setP({ error: e instanceof Error ? e.message : "ההעלאה נכשלה." });
      }
    }
  }

  async function remove(a: AssetView) {
    const res = await fetch(`/api/studio/media/${a.id}`, { method: "DELETE" });
    if (res.ok) setAssets((l) => l?.filter((x) => x.id !== a.id) ?? null);
    else setMsg(res.status === 409 ? `"${a.filename}" בשימוש בקורס, ולכן אי אפשר למחוק אותו.` : "המחיקה נכשלה.");
  }

  async function saveAlt(a: AssetView, altText: string) {
    await fetch(`/api/studio/media/${a.id}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ altText }) });
  }

  if (storage === "none") {
    return (
      <div className="block media-off" role="status">
        <h2>אחסון הקבצים עדיין לא הוגדר</h2>
        <p className="muted">כדי להעלות סרטונים ותמונות צריך לחבר את Cloudflare R2. ההוראות נמצאות בקובץ DEPLOY.md במאגר, בפרק ״אחסון קבצים״.</p>
      </div>
    );
  }

  return (
    <div className="media">
      {canManage && (
        <div
          className={`dropzone${drag ? " is-drag" : ""}`}
          onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
          onDragLeave={() => setDrag(false)}
          onDrop={(e) => { e.preventDefault(); setDrag(false); void handleFiles(e.dataTransfer.files); }}
        >
          <p className="dropzone-title">גררו לכאן קבצים, או</p>
          <button type="button" className="btn btn-dark btn-sm" onClick={() => input.current?.click()}>בחירת קבצים מהמחשב</button>
          <p className="muted dropzone-hint">תמונות JPG, PNG, WebP (עד 15MB) · סרטונים MP4, WebM (עד 1GB) · שמע MP3, M4A · כתוביות VTT</p>
          <input ref={input} type="file" multiple hidden accept={ACCEPT_ATTR} aria-label="בחירת קבצים להעלאה" onChange={(e) => e.target.files && void handleFiles(e.target.files)} />
        </div>
      )}

      {uploads.length > 0 && (
        <ul className="uploads" aria-live="polite">
          {uploads.map((u) => (
            <li key={u.name} className={u.error ? "is-error" : ""}>
              <span className="uploads-name">{u.name}</span>
              {u.error ? (
                <>
                  <span className="form-error">{u.error}</span>
                  <button type="button" className="ed-link" onClick={() => setUploads((l) => l.filter((x) => x.name !== u.name))}>סגירה</button>
                </>
              ) : (
                <>
                  <span className="uploads-bar" role="progressbar" aria-label={`העלאת ${u.name}`} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(u.progress * 100)}>
                    <span style={{ width: `${Math.round(u.progress * 100)}%` }} />
                  </span>
                  <span className="num">{u.progress >= 1 ? "מאמת…" : `${Math.round(u.progress * 100)}%`}</span>
                </>
              )}
            </li>
          ))}
        </ul>
      )}

      {msg && <p className="form-error" role="alert">{msg}</p>}

      {assets === null ? (
        <p className="muted">טוען…</p>
      ) : assets.length === 0 ? (
        <p className="muted">{kinds ? `אין עדיין ${kinds.map((k) => KIND_LABEL[k]).join(" או ")} בספרייה. העלו קובץ למעלה.` : "הספרייה ריקה. העלו את הקובץ הראשון."}</p>
      ) : (
        <ul className="media-grid">
          {assets.map((a) => (
            <li key={a.id} className="media-card">
              {mode === "pick" ? (
                <button type="button" className="media-thumb media-pick" onClick={() => onPick?.(a)} aria-label={`בחירת ${a.filename}`}>
                  <Thumb a={a} />
                </button>
              ) : (
                <div className="media-thumb"><Thumb a={a} /></div>
              )}
              <div className="media-meta">
                <span className="media-name" title={a.filename}>{a.filename}</span>
                <span className="muted">{KIND_LABEL[a.kind]} · {formatBytes(a.sizeBytes)}</span>
                {mode === "manage" && canManage && a.kind === "image" && (
                  <input aria-label={`תיאור חלופי ל-${a.filename}`} placeholder="תיאור התמונה לנגישות" defaultValue={a.altText} onBlur={(e) => void saveAlt(a, e.target.value)} />
                )}
                {mode === "manage" && canManage && (
                  <button type="button" className="ed-link-danger" onClick={() => void remove(a)}>מחיקה</button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function Thumb({ a }: { a: AssetView }) {
  if (a.kind === "image") return <img src={a.url} alt="" loading="lazy" />;
  if (a.kind === "video") return <video src={a.url} preload="metadata" muted playsInline aria-hidden="true" />;
  return <span className="media-icon" aria-hidden="true">{a.kind === "audio" ? "♪" : "CC"}</span>;
}
