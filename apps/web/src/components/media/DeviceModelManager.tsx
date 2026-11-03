"use client";
import { useCallback, useEffect, useState } from "react";
import { Field } from "@/components/editor/EditorField";
type Device={id:string;name:string;manufacturer:string;deviceType:"semi_automatic"|"fully_automatic";manualUrl:string;status:"draft"|"verified";updatedAt:string;verifiedAt:string|null};
export function DeviceModelManager({canManage,canReview}:{canManage:boolean;canReview:boolean}) {
  const [devices,setDevices]=useState<Device[]>([]),[name,setName]=useState(""),[manufacturer,setManufacturer]=useState(""),[deviceType,setType]=useState("semi_automatic"),[manualUrl,setManual]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  const load=useCallback(async()=>{const response=await fetch("/api/studio/devices");if(!response.ok)throw Error("לא ניתן לטעון דגמי מכשירים.");setDevices((await response.json()).devices);},[]);
  useEffect(()=>{void load().catch(error=>setMessage(error.message));},[load]);
  return <details className="block"><summary>דגמי מכשירים ותיעוד אימות אנושי</summary>
    <p className="ef-hint">רישום דגם אינו מפעיל סימולציה רפואית. ניתן לאמת דגם רק לאחר בדיקת מדריך היצרן ובדיקה מול מכשיר הדרכה אמיתי.</p>
    {canManage && <form onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage("");try{const response=await fetch("/api/studio/devices",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({name,manufacturer,deviceType,manualUrl})}),body=await response.json();if(!response.ok){setMessage(body.message ?? "שמירת הדגם נכשלה.");return;}setName("");setManufacturer("");setManual("");await load();}catch{setMessage("אין חיבור לשרת.");}finally{setBusy(false);}}}><fieldset disabled={busy}><legend>דגם חדש — טיוטה</legend>
      <Field label="שם דגם המכשיר">{id=><input id={id} required value={name} maxLength={200} onChange={e=>setName(e.target.value)} />}</Field>
      <Field label="יצרן">{id=><input id={id} required value={manufacturer} maxLength={200} onChange={e=>setManufacturer(e.target.value)} />}</Field>
      <Field label="סוג הדגם">{id=><select id={id} value={deviceType} onChange={e=>setType(e.target.value)}><option value="semi_automatic">חצי אוטומטי</option><option value="fully_automatic">אוטומטי מלא</option></select>}</Field>
      <Field label="קישור HTTPS למדריך היצרן">{id=><input id={id} type="url" required dir="ltr" value={manualUrl} onChange={e=>setManual(e.target.value)} />}</Field>
      <button type="submit" className="btn btn-quiet">יצירת דגם בטיוטה</button>
    </fieldset></form>}
    <ul>{devices.map(device=><li key={device.id}><strong>{device.name}</strong> · {device.manufacturer} · {device.status==="verified" ? "מאומת" : "טיוטה"} · <a href={device.manualUrl} target="_blank" rel="noreferrer">מדריך היצרן</a>{canReview && device.status!=="verified" && <VerifyDevice device={device} onDone={()=>void load()} />}</li>)}</ul>
    {message && <p role="status">{message}</p>}
  </details>;
}
function VerifyDevice({device,onDone}:{device:Device;onDone:()=>void}) {
  const [guideReviewed,setGuide]=useState(false),[trainerTested,setTrainer]=useState(false),[notes,setNotes]=useState(""),[message,setMessage]=useState(""),[busy,setBusy]=useState(false);
  return <details><summary>אימות אנושי של {device.name}</summary><form onSubmit={async e=>{e.preventDefault();setBusy(true);setMessage("");try{const response=await fetch("/api/studio/devices",{method:"PATCH",headers:{"content-type":"application/json"},body:JSON.stringify({id:device.id,expectedUpdatedAt:device.updatedAt,evidence:{guideReviewed,trainerTested,notes}})}),body=await response.json();if(!response.ok){setMessage(body.message ?? "האימות לא נשמר.");return;}onDone();}catch{setMessage("אין חיבור לשרת.");}finally{setBusy(false);}}}><fieldset disabled={busy}>
    <label className="ef-check"><input type="checkbox" required checked={guideReviewed} onChange={e=>setGuide(e.target.checked)} />בדקתי את פרטי הדגם מול מדריך היצרן</label>
    <label className="ef-check"><input type="checkbox" required checked={trainerTested} onChange={e=>setTrainer(e.target.checked)} />ביצעתי בדיקה מול מכשיר הדרכה אמיתי מדגם זה</label>
    <Field label="תיעוד הבדיקה, גרסת המדריך ותאריך">{id=><textarea id={id} required value={notes} maxLength={3000} onChange={e=>setNotes(e.target.value)} />}</Field><button type="submit">שמירת אימות הדגם</button>
  </fieldset></form>{message && <p role="alert">{message}</p>}</details>;
}
