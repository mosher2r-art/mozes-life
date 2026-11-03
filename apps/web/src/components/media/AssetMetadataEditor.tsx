"use client";
import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Course, parseVtt } from "@mozes/content-schema";
import { PreviewDialog } from "@/components/editor/PreviewDialog";
import type { AssetUsage } from "@/server/media-usage";
import { AssetMetadata } from "@/lib/media-v2-policy";
import { Field } from "@/components/editor/EditorField";
import { ACCEPT_ATTR } from "@/lib/media-policy";
import { type AssetView, uploadFile } from "./upload";
export function AssetMetadataEditor({ asset, canReview, canManage, onDone }: {asset:AssetView;canReview:boolean;canManage:boolean;onDone:()=>void}) {
  const [metadata,setMetadata]=useState(()=>AssetMetadata.parse(asset.metadata ?? {altText:asset.altText})),[busy,setBusy]=useState(false),[message,setMessage]=useState("");
  const [history,setHistory]=useState<{id:string;versionNo:number;filename:string;createdAt:string;metadata:AssetMetadata}[]>([]),replacement=useRef<HTMLInputElement>(null);
  const [usage,setUsage]=useState<AssetUsage[]>([]),[preview,setPreview]=useState(false),[captionPreview,setCaptionPreview]=useState("");
  useEffect(()=>{const controller=new AbortController();void fetch(`/api/studio/media/${asset.id}/versions`,{signal:controller.signal}).then(r=>r.ok ? r.json() : null).then(body=>{if(body?.versions)setHistory(body.versions);if(body?.usage)setUsage(body.usage);}).catch(()=>{});return()=>controller.abort();},[asset.id,asset.versionId]);
  const save=async(review?:"approved"|"rejected")=>{
    setBusy(true);setMessage("");try{
      const editable=Object.fromEntries(Object.entries(metadata).filter(([key])=>!["medicalStatus","reviewedBy","reviewedAt","embed"].includes(key)));
      const response=await fetch(`/api/studio/media/${asset.id}/metadata`,{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({expectedVersionId:asset.versionId,metadata:canManage ? editable : {},review})}),body=await response.json();
      if(!response.ok){setMessage(body.message ?? "שמירת המטא־דאטה נכשלה.");return;}onDone();
    }catch{setMessage("אין חיבור לשרת. השמירה לא אושרה.");}finally{setBusy(false);}
  };
  const update=<K extends keyof AssetMetadata>(key:K,value:AssetMetadata[K])=>setMetadata(m=>({...m,[key]:value}));
  return <div className="v2-asset-metadata"><h3>{asset.filename} · גרסה {asset.versionNo ?? 1}</h3>
    <button type="button" className="btn btn-quiet" onClick={()=>{if(asset.kind!=="captions"){setPreview(true);return;}void fetch(asset.url).then(async response=>{if(!response.ok)throw Error();const cues=parseVtt(await response.text());setCaptionPreview(cues.map(cue=>`${cue.start.toFixed(2)}–${cue.end.toFixed(2)}: ${cue.text}`).join("\n"));}).catch(()=>setMessage("לא ניתן להציג את קובץ הכתוביות."));}}>תצוגה מקדימה של הנכס</button>
    {captionPreview && <pre className="v2-preserve-lines">{captionPreview}</pre>}
    <p>אישור רפואי: {metadata.medicalStatus==="approved" ? "מאושר" : metadata.medicalStatus==="rejected" ? "נדחה" : "טרם אושר"}{metadata.reviewedAt ? ` · ${new Date(metadata.reviewedAt).toLocaleString("he-IL")}` : ""}</p>
    <fieldset disabled={busy || !canManage}>
      <Field label="תיאור חלופי בעברית">{id=><textarea id={id} value={metadata.altText} maxLength={300} onChange={e=>update("altText",e.target.value)} />}</Field>
      <Field label="מקור הקובץ">{id=><input id={id} value={metadata.source} maxLength={2000} onChange={e=>update("source",e.target.value)} />}</Field>
      <Field label="סוג הרישיון">{id=><input id={id} value={metadata.licenseType} maxLength={200} onChange={e=>update("licenseType",e.target.value)} />}</Field>
      {(["commercialUseAllowed","editingAllowed"] as const).map(key=><Field key={key} label={key==="commercialUseAllowed" ? "האם מותר שימוש מסחרי?" : "האם מותר לערוך את הקובץ?"}>{id=><select id={id} value={metadata[key]===null ? "unknown" : String(metadata[key])} onChange={e=>update(key,e.target.value==="unknown" ? null : e.target.value==="true")}><option value="unknown">טרם נבדק</option><option value="true">כן</option><option value="false">לא</option></select>}</Field>)}
      <label className="ef-check"><input type="checkbox" checked={metadata.creditRequired} onChange={e=>update("creditRequired",e.target.checked)} />הרישיון מחייב קרדיט</label>
      <Field label="נוסח הקרדיט">{id=><textarea id={id} value={metadata.creditText} maxLength={1000} onChange={e=>update("creditText",e.target.value)} />}</Field>
      <div className="ef-row">{(["width","height","durationMs"] as const).map(key=><Field key={key} label={key==="width" ? "רוחב בפיקסלים" : key==="height" ? "גובה בפיקסלים" : "משך באלפיות שנייה"}>{id=><input id={id} type="number" min={key==="durationMs" ? 0 : 1} max={key==="durationMs" ? 86400000 : 100000} value={metadata[key] ?? ""} onChange={e=>update(key,e.target.value==="" ? undefined : Number(e.target.value))} />}</Field>)}</div>
      <p className="ef-hint">שמירת שינוי יוצרת גרסה חדשה ודורשת בדיקה רפואית מחדש. פרקים שכבר פורסמו נשארים מקובעים לגרסה ששימשה בפרסום.</p>
      <div className="ef-row"><button type="button" className="btn btn-primary" onClick={()=>void save()}>שמירת מטא־דאטה כגרסה חדשה</button></div>
      {!metadata.embed && <><input ref={replacement} type="file" hidden accept={ACCEPT_ATTR} aria-label="קובץ חלופי לנכס" onChange={async e=>{const file=e.target.files?.[0];if(!file)return;setBusy(true);setMessage("");try{await uploadFile(file,()=>{},asset.id);onDone();}catch(error){setMessage(error instanceof Error ? error.message : "החלפת הקובץ נכשלה.");}finally{setBusy(false);}}} /><button type="button" className="btn btn-quiet" onClick={()=>replacement.current?.click()}>העלאת קובץ חלופי כגרסה חדשה</button></>}
    </fieldset>
    <div className="ef-row">{canReview && <><button type="button" disabled={busy} onClick={()=>void save("approved")}>אישור רפואי לאחר בדיקת הנכס</button><button type="button" disabled={busy} onClick={()=>void save("rejected")}>דחיית הנכס בבדיקה רפואית</button></>}</div>
    {message && <p role="alert">{message}</p>}
    <details><summary>היסטוריית גרסאות הנכס</summary><ol>{history.map(v=><li key={v.id}>גרסה {v.versionNo} · {new Date(v.createdAt).toLocaleString("he-IL")} · {v.filename} · {v.metadata.medicalStatus}{!v.metadata.embed && <> · <a href={`/api/media/${asset.id}/versions/${v.id}`} target="_blank" rel="noreferrer">צפייה בגרסה זו</a></>}</li>)}</ol></details>
    <details open><summary>בשימוש ב־ ({usage.length})</summary>{usage.length ? <ul>{usage.map((use,i)=><li key={i}><Link href={use.courseId ? `/studio/courses/${use.courseId}` : `/studio/chapters/${use.chapterId}?screen=${encodeURIComponent(use.screenId)}`}>{use.title}</Link> · {use.screenTitle} · {use.status==="published" ? `גרסה מפורסמת ${use.versionNo}` : "טיוטה"}</li>)}</ul> : <p>הנכס אינו מופיע כעת בפרקים או בקורסים.</p>}</details>
    {preview && <PreviewDialog content={assetPreview(asset)} resolveMedia={ref=>ref.assetId===asset.id ? {src:asset.url,mime:asset.mime,...asset.metadata} : null} onClose={()=>setPreview(false)} />}
  </div>;
}

function assetPreview(asset:AssetView):Course {
  const component={id:"preview-component",type:asset.kind,media:{assetId:asset.id}};
  const details=asset.kind==="image" ? {alt:asset.altText || asset.filename,decorative:false} : asset.kind==="audio" ? {transcript:"תצוגת קובץ. תמליל תוכן מוגדר בפרק שמשתמש בהקלטה."} : asset.kind==="animation" ? {alt:asset.altText || asset.filename,loop:false,playOn:"click"} : {};
  return Course.parse({schema:"mozes-course",schemaVersion:2,id:"asset-preview",title:asset.filename,locale:"he",units:[{id:"preview-unit",title:"תצוגת נכס",screens:[{id:"preview-screen",title:asset.filename,template:"text",medical:{relevant:false},slots:{body:[{...component,...details}]}}]}]});
}
