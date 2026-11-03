"use client";
import { useCallback, useEffect, useState } from "react";
import type { ResolvedMedia } from "@mozes/player-react";
import type { Issue } from "@mozes/validator";
import type { Screen } from "@mozes/content-schema";
export function ChapterPublicationTools({ chapterId, revision, schemaVersion, selected, dirty, canReview, canPublish, canEdit, flush, upgrade, onIssues, selectScreen }: {
  chapterId:string;revision:number;schemaVersion:1|2;selected:Screen|null;dirty:boolean;canReview:boolean;canPublish:boolean;canEdit:boolean;
  flush:()=>Promise<boolean>;upgrade:()=>void;onIssues:(issues:Issue[],revision:number,media?:Record<string,ResolvedMedia>)=>void;selectScreen:(id:string)=>void;
}) {
  const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),[nonce,setNonce]=useState(0),[reviewed,setReviewed]=useState<string[]>([]),[note,setNote]=useState(""),[checkedRevision,setCheckedRevision]=useState<number|null>(null),[mediaFingerprint,setMediaFingerprint]=useState(""),[pinnedMedia,setPinnedMedia]=useState(false);
  const [versions,setVersions]=useState<{id:string;versionNo:number;publishedAt:string}[]>([]),[issues,setIssues]=useState<Issue[]>([]);
  const refresh=useCallback(async(signal:AbortSignal)=>{
    const [a,b]=await Promise.all([fetch(`/api/studio/chapters/${chapterId}/validation`,{signal}),fetch(`/api/studio/chapters/${chapterId}/versions`,{signal})]);
    if(a.ok){const body=await a.json();setIssues(body.issues);setReviewed(body.reviewedScreenIds);setCheckedRevision(body.revision);setMediaFingerprint(body.mediaFingerprint);setPinnedMedia(body.pinnedMedia);onIssues(body.issues,body.revision,body.media);}if(b.ok){const body=await b.json();setVersions(body.versions);}
  },[chapterId,onIssues]);
  useEffect(()=>{if(dirty)return;const controller=new AbortController();void refresh(controller.signal).catch(error=>{if(error.name!=="AbortError")setMessage("לא ניתן לטעון בדיקת פרסום; נסו לרענן.");});return()=>controller.abort();},[dirty,revision,nonce,refresh]);
  const act=async(path:string,body:unknown)=>{
    setBusy(true);setMessage("");
    try{if(!await flush()){setMessage("יש להמתין לשמירת הטיוטה לפני הפעולה.");return;}
      const response=await fetch(`/api/studio/chapters/${chapterId}/${path}`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify(body)}),result=await response.json();
      if(!response.ok){setMessage(result.message ?? result.errors?.join("\n") ?? "הפעולה לא הושלמה.");return;}
      if(["rollback","use_latest_media"].includes((body as {action?:string}).action ?? "")){location.reload();return;}
      setMessage(path==="reviews" ? "החלטת הבדיקה נשמרה עבור תוכן המסך הנוכחי." : `נשמרה גרסת פרסום ${result.versionNo}. קורסים קיימים מתעדכנים לאחר פרסום מחדש של הקורס.`);setNonce(n=>n+1);
    }catch{setMessage("אין חיבור לשרת; הפעולה לא אושרה.");}finally{setBusy(false);}
  };
  const checked=checkedRevision===revision && !dirty;
  const blockers=issues.filter(i=>i.severity==="error");
  return <details className="ed-card v2-publication-tools"><summary>בדיקת פרסום, אישורים וגרסאות</summary>
    <button type="button" disabled={busy||dirty} onClick={()=>setNonce(n=>n+1)}>רענון בדיקת פרסום ומדיה</button>
    {schemaVersion===1 && <p>הפרק שמור ב־v1. הוא ישודרג בטיוטה רק בשמירה הבאה. {canEdit && <button type="button" disabled={busy||dirty} onClick={upgrade}>שמירת טיוטה כ־v2</button>}</p>}
    <p role="status">{dirty ? "יש להמתין לשמירת השינויים כדי לקבל בדיקת פרסום עדכנית." : !checked ? "טוען בדיקת פרסום מהשרת…" : blockers.length ? `${blockers.length} חסמים לפרסום` : "בדיקת השרת לא מצאה חסמי פרסום בטיוטה השמורה."}</p>
    {!dirty && blockers.length>0 && <ul>{blockers.map((issue,i)=><li key={`${issue.code}-${i}`}>{issue.screenId ? <button type="button" className="btn btn-quiet btn-sm" onClick={()=>selectScreen(issue.screenId!)}>{issue.message}</button> : issue.message}{issue.path && <small dir="ltr"> {issue.path}</small>}</li>)}</ul>}
    {selected?.medical.relevant && <fieldset disabled={busy||dirty||schemaVersion!==2}><legend>בדיקה רפואית: {selected.title}</legend><p>{reviewed.includes(selected.id) ? "תוכן המסך השמור מאושר." : "אין אישור לתוכן המסך הנוכחי."}</p>
      {canReview ? <><label>הערת בדיקה<textarea value={note} maxLength={2000} onChange={e=>setNote(e.target.value)} /></label><p className="ef-hint">אשרו רק לאחר בדיקה מקצועית של התוכן והמקורות. שינוי התוכן דורש אישור לגרסה החדשה.</p><div className="ef-row"><button type="button" onClick={()=>void act("reviews",{screenId:selected.id,revision,status:"approved",note,mediaFingerprint})}>אישור תוכן המסך לאחר בדיקה</button><button type="button" onClick={()=>void act("reviews",{screenId:selected.id,revision,status:"rejected",note,mediaFingerprint})}>דחיית תוכן המסך</button></div></> : <p>נדרש משתמש בעל הרשאת בדיקה רפואית.</p>}
    </fieldset>}
    {canPublish && <button type="button" className="btn btn-primary" disabled={busy||dirty||!checked||schemaVersion!==2||blockers.length>0} onClick={()=>void act("versions",{action:"publish",revision})}>פרסום גרסה עצמאית של הפרק</button>}
    {pinnedMedia && <p>מדיית הטיוטה מקובעת לגרסאות ששוחזרו. {canEdit && <button type="button" disabled={busy||dirty} onClick={()=>void act("versions",{action:"use_latest_media",revision})}>עדכון מדיית הטיוטה לגרסאות האחרונות בספרייה</button>}</p>}
    <h3>גרסאות פרק שנשמרו בפרסום</h3>{versions.length ? <ol>{versions.map(v=><li key={v.id}>גרסה {v.versionNo} · {new Date(v.publishedAt).toLocaleString("he-IL")} {canEdit && <button type="button" disabled={busy||dirty} onClick={()=>void act("versions",{action:"rollback",versionId:v.id,revision})}>שחזור גרסה {v.versionNo} לטיוטה</button>}</li>)}</ol> : <p>אין עדיין גרסאות פרסום עצמאיות.</p>}
    {message && <p className="v2-preserve-lines" role="status">{message}</p>}
  </details>;
}
