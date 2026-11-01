"use client";

import { checkDeclared } from "@/lib/media-policy";

export interface AssetView {
  id: string;
  kind: "image" | "video" | "audio" | "captions";
  filename: string;
  mime: string;
  sizeBytes: number;
  altText: string;
  url: string;
  createdAt: string;
}

/** Uploads a file: reserve → PUT straight to storage (with progress) → server verification. */
export async function uploadFile(file: File, onProgress: (fraction: number) => void): Promise<AssetView> {
  const pre = checkDeclared(file.name, file.type, file.size);
  if (!pre.ok) throw new Error(pre.message);

  const res = await fetch("/api/studio/media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ filename: file.name, mime: pre.type.mime, size: file.size }),
  });
  const reserved = (await res.json().catch(() => ({}))) as { id?: string; upload?: { url: string; method: string; headers: Record<string, string> }; message?: string };
  if (!res.ok || !reserved.id || !reserved.upload) throw new Error(reserved.message ?? "ההעלאה נכשלה.");

  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open(reserved.upload!.method, reserved.upload!.url);
    for (const [k, v] of Object.entries(reserved.upload!.headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error("שליחת הקובץ לאחסון נכשלה.")));
    xhr.onerror = () => reject(new Error("אין חיבור לאחסון. בדקו את החיבור לאינטרנט ונסו שוב."));
    xhr.send(file);
  });

  const done = await fetch(`/api/studio/media/${reserved.id}/complete`, { method: "POST" });
  const body = (await done.json().catch(() => ({}))) as { asset?: AssetView; message?: string };
  if (!done.ok || !body.asset) throw new Error(body.message ?? "אימות הקובץ נכשל.");
  onProgress(1);
  return body.asset;
}
