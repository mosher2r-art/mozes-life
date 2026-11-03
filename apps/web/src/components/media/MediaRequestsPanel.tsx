"use client";
import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { AssetKind } from "@/lib/media-policy";
import { MediaLibrary } from "./MediaLibrary";
import type { AssetView } from "./upload";
type RequestItem={chapterId:string;chapterTitle:string;revision:number;screenId:string;requestId:string;description:string;kinds:AssetKind[]};
export function MediaRequestsPanel({canEdit,canManage,canReview}:{canEdit:boolean;canManage:boolean;canReview:boolean}) {
  const [requests,setRequests]=useState<RequestItem[]>([]),[picking,setPicking]=useState<RequestItem|null>(null),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{const response=await fetch("/api/studio/media/requests");if(!response.ok)throw Error("לא ניתן לטעון בקשות מדיה.");const body=await response.json();const unique=new Map<string,RequestItem>();for(const request of body.requests as RequestItem[])unique.set(`${request.chapterId}:${request.requestId}`,request);setRequests([...unique.values()]);},[]);
  useEffect(()=>{void load().catch(error=>setMessage(error.message));},[load]);
  const pick=async(asset:AssetView)=>{if(!picking)return;setBusy(true);setMessage("");try{const response=await fetch("/api/studio/media/requests",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({chapterId:picking.chapterId,requestId:picking.requestId,assetId:asset.id,revision:picking.revision})}),body=await response.json();if(!response.ok){setMessage(body.message ?? "לא ניתן להשלים את הבקשה.");return;}setPicking(null);await load();setMessage("המקום השמור הוחלף בנכס בטיוטת הפרק. גרסאות מפורסמות נשארו ללא שינוי.");}catch{setMessage("אין חיבור לשרת; השלמת הבקשה לא אושרה.");}finally{setBusy(false);}};
  return <details className="block"><summary>בקשות מדיה פתוחות ({requests.length})</summary>
    <p className="ef-hint">כל בקשה מייצגת מקום שמור בטיוטה. אפשר לבחור נכס מהספרייה או להעלות קובץ מתאים.</p>
    {requests.length ? <ul>{requests.map(request=><li key={`${request.chapterId}:${request.requestId}`}><Link href={`/studio/chapters/${request.chapterId}?screen=${encodeURIComponent(request.screenId)}`}>{request.chapterTitle}</Link> · {request.description} <small dir="ltr">({request.requestId})</small> {canEdit && <button type="button" disabled={busy} onClick={()=>setPicking(request)}>השלמת בקשת מדיה</button>}</li>)}</ul> : <p>אין מקומות שמורים שדורשים מדיה.</p>}
    {picking && <section aria-label="בחירת נכס לבקשת מדיה"><h3>{picking.description}</h3><MediaLibrary mode="pick" kinds={picking.kinds} canManage={canManage} canReview={canReview} onPick={asset=>{if(!busy)void pick(asset);}} /><button type="button" disabled={busy} onClick={()=>setPicking(null)}>ביטול בחירה</button></section>}
    {message && <p role="status">{message}</p>}
  </details>;
}
