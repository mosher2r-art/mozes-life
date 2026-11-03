"use client";
import type { AssetMetadata } from "@/lib/media-v2-policy";

import { checkDeclared } from "@/lib/media-policy";

export interface AssetView {
  id: string;
  kind: "image" | "video" | "audio" | "captions" | "animation";
  versionId?: string;
  versionNo?: number;
  metadata?: AssetMetadata;
  filename: string;
  mime: string;
  sizeBytes: number;
  altText: string;
  url: string;
  createdAt: string;
}

/** Uploads a file: reserve → PUT straight to storage (with progress) → server verification. */
export async function uploadFile(file: File, onProgress: (fraction: number) => void, replaceId?: string): Promise<AssetView> {
  const pre = checkDeclared(file.name, file.type, file.size);
  if (!pre.ok) throw new Error(pre.message);

  const res = await fetch(replaceId ? `/api/studio/media/${replaceId}/versions` : "/api/studio/media", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...(replaceId ? {action:"upload"} : {}), filename: file.name, mime: pre.type.mime, size: file.size }),
  });
  const reserved = (await res.json().catch(() => ({}))) as { id?: string; versionId?: string; upload?: { url: string; method: string; headers: Record<string, string> }; message?: string };
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

  const done = await fetch(replaceId ? `/api/studio/media/${reserved.id}/versions` : `/api/studio/media/${reserved.id}/complete`, { method: "POST", ...(replaceId ? {headers:{"content-type":"application/json"},body:JSON.stringify({action:"complete",versionId:reserved.versionId})} : {}) });
  const body = (await done.json().catch(() => ({}))) as { asset?: AssetView; message?: string };
  if (!done.ok || !body.asset) throw new Error(body.message ?? "אימות הקובץ נכשל.");
  const measured=await measureFile(file,body.asset.kind);
  if(body.asset.versionId && Object.keys(measured).length){
    try{
      const update=await fetch(`/api/studio/media/${body.asset.id}/metadata`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersionId:body.asset.versionId,metadata:measured})});
      if(update.ok){const version=await update.json();body.asset={...body.asset,versionId:version.versionId,versionNo:version.versionNo,url:`/api/media/${body.asset.id}/versions/${version.versionId}`,metadata:{...body.asset.metadata!,...measured}};}
    }catch{/* File verification succeeded; dimensions may also be entered in the library. */}
  }
  onProgress(1);
  return body.asset;
}

/** Browser-measured metadata is advisory; it never changes permissions or medical approval. */
function measureFile(file:File,kind:AssetView["kind"]):Promise<Partial<AssetMetadata>> {
  if(!["image","video","audio"].includes(kind))return Promise.resolve({});
  return new Promise(resolve=>{
    const url=URL.createObjectURL(file),element=kind==="image" ? new Image() : document.createElement(kind==="video" ? "video" : "audio");
    let settled=false;const finish=(metadata:Partial<AssetMetadata>)=>{if(settled)return;settled=true;clearTimeout(timeout);element.onload=null;element.onerror=null;if(element instanceof HTMLMediaElement){element.onloadedmetadata=null;element.removeAttribute("src");element.load();}URL.revokeObjectURL(url);resolve(metadata);};
    const timeout=setTimeout(()=>finish({}),5000);element.onerror=()=>finish({});
    if(element instanceof HTMLImageElement)element.onload=()=>finish(element.naturalWidth && element.naturalHeight ? {width:element.naturalWidth,height:element.naturalHeight} : {});
    else {element.preload="metadata";element.onloadedmetadata=()=>finish({...(Number.isFinite(element.duration) && element.duration>=0 && element.duration<=86400 ? {durationMs:Math.round(element.duration*1000)} : {}),...(element instanceof HTMLVideoElement && element.videoWidth && element.videoHeight ? {width:element.videoWidth,height:element.videoHeight} : {})});}
    element.src=url;
  });
}
