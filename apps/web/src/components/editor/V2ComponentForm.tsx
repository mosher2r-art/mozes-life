"use client";
import { useEffect, useState } from "react";
import type { ComponentV2, HotspotShape } from "@mozes/content-schema";
import { Field } from "./EditorField";
import { CaptionTracksEditor, MediaRefField, mediaPlaceholder, type EditorMedia, type PickEditorMedia } from "./MediaRefField";
import { RichTextEditor } from "./RichTextEditor";
import { HotspotCanvas } from "./HotspotCanvas";
import { newId, textToBlocks } from "./ops";
export type V2Patch = (fn: (component: ComponentV2) => void, key: string) => void;
export function PrimaryMediaForm({ c, patch, media, pickMedia, disabled, scenario }: { c: Extract<ComponentV2,{type:"image"|"video"|"audio"}>; patch:V2Patch;media:EditorMedia;pickMedia:PickEditorMedia;disabled:boolean;scenario:boolean }) {
  const common = {media,pickMedia,disabled};
  return <>
    <MediaRefField {...common} label={c.type==="image" ? "תמונה" : c.type==="video" ? "סרטון" : "קובץ שמע"} value={c.media} kinds={[c.type]} onChange={(ref,a) => ref && patch(x => {if(x.type==="image" || x.type==="video" || x.type==="audio") {x.media=ref;if(x.type==="image" && !x.alt && a) x.alt=a.altText;}},`${c.id}.media`)} />
    {c.type==="image" && <>
      <label className="ef-check"><input type="checkbox" checked={c.decorative} disabled={disabled} onChange={e => patch(x => {if(x.type==="image") x.decorative=e.target.checked;},`${c.id}.decorative`)} />תמונה דקורטיבית בלבד (בלי מידע חשוב)</label>
      {!c.decorative && <Field label="תיאור התמונה (לנגישות)">{id => <input id={id} required value={c.alt} disabled={disabled} onChange={e => patch(x => {if(x.type==="image") x.alt=e.target.value;},`${c.id}.alt`)} />}</Field>}
      <Field label="כיתוב מתחת לתמונה (לא חובה)">{id => <input id={id} value={c.caption ?? ""} disabled={disabled} onChange={e => patch(x => {if(x.type==="image") x.caption=e.target.value || undefined;},`${c.id}.caption`)} />}</Field>
      <Field label="קרדיט לתמונה">{id => <input id={id} value={c.credit ?? ""} disabled={disabled} onChange={e => patch(x => {if(x.type==="image") x.credit=e.target.value || undefined;},`${c.id}.credit`)} />}</Field>
      <Field label="יחס תצוגה">{id => <select id={id} value={c.aspectRatio} disabled={disabled} onChange={e => patch(x => {if(x.type==="image") x.aspectRatio=e.target.value as typeof c.aspectRatio;},`${c.id}.aspectRatio`)}>{["auto","16:9","4:3","1:1","9:16"].map(r => <option key={r} value={r}>{r==="auto" ? "לפי התמונה" : r}</option>)}</select>}</Field>
      <p className="ef-hint">בנגן אפשר ללחוץ על התמונה להגדלה.</p>
    </>}
    {c.type==="video" && <>
      <CaptionTracksEditor {...common} value={c.captions} onChange={captions => patch(x => {if(x.type==="video") x.captions=captions;},`${c.id}.captions`)} />
      <MediaRefField {...common} label="תמונת פתיחה (לא חובה)" value={c.poster} kinds={["image"]} optional onChange={ref => patch(x => {if(x.type==="video") x.poster=ref;},`${c.id}.poster`)} />
      <Field label="חובה לצפות (%)" hint="0 = אין חובה; 100 = הצפייה הושלמה רק באירוע סיום הסרטון.">{id => <input id={id} type="number" min={0} max={100} value={c.requiredWatchPercent} disabled={disabled} onChange={e => patch(x => {if(x.type==="video") x.requiredWatchPercent=Math.max(0,Math.min(100,Number(e.target.value)||0));},`${c.id}.requiredWatch`)} />}</Field>
      {scenario && <Field label="עצירה והצגת השאלה בשנייה" hint="ריק = בסוף הסרטון">{id => <input id={id} type="number" min={0} step={.5} value={c.pauseAtMs === undefined ? "" : c.pauseAtMs/1000} disabled={disabled} onChange={e => patch(x => {if(x.type==="video") x.pauseAtMs=e.target.value==="" ? undefined : Math.max(0,Math.round(Number(e.target.value)*1000));},`${c.id}.pause`)} />}</Field>}
    </>}
    {(c.type==="audio" || c.type==="video") && <Field label={c.type==="audio" ? "תמליל (חובה, לנגישות)" : "תמליל (לנגישות)"}>{id => <textarea id={id} rows={4} value={c.transcript ?? ""} disabled={disabled} onChange={e => patch(x => {if(x.type==="audio" || x.type==="video") x.transcript=e.target.value;},`${c.id}.transcript`)} />}</Field>}
    {c.type==="audio" && <label className="ef-check"><input type="checkbox" checked={c.autoplay} disabled={disabled} onChange={e => patch(x => {if(x.type==="audio") x.autoplay=e.target.checked;},`${c.id}.autoplay`)} />ניסיון הפעלה אוטומטית (כפוף להרשאת הדפדפן)</label>}
  </>;
}
export function V2ComponentForm({ c, patch, media, pickMedia, disabled }: { c: ComponentV2; patch: V2Patch; media: EditorMedia; pickMedia: PickEditorMedia; disabled: boolean }) {
  const common = { media,pickMedia,disabled };
  const [devices,setDevices] = useState<{ id:string;name:string;status:string }[]>([]);
  useEffect(() => { if(c.type !== "simulation") return; const controller = new AbortController(); void fetch("/api/studio/devices",{signal:controller.signal}).then(r => r.ok ? r.json() : null).then(body => { if(body?.devices) setDevices(body.devices); }).catch(() => {}); return () => controller.abort(); },[c.type]);
  if (c.type === "animation") return <>
    <MediaRefField {...common} label="אנימציה או וידאו שקט" value={c.media} kinds={["animation","video"]} onChange={ref => ref && patch(x => { if(x.type==="animation") x.media=ref; },`${c.id}.media`)} />
    <Field label="תיאור האנימציה לנגישות">{id => <input id={id} required value={c.alt} disabled={disabled} onChange={e => patch(x => { if(x.type==="animation") x.alt=e.target.value; },`${c.id}.alt`)} />}</Field>
    <Field label="מתי להפעיל">{id => <select id={id} value={c.playOn} disabled={disabled} onChange={e => patch(x => { if(x.type==="animation") x.playOn=e.target.value as "enter"|"click"; },`${c.id}.playOn`)}><option value="click">בלחיצה</option><option value="enter">בכניסה למסך</option></select>}</Field>
    <label className="ef-check"><input type="checkbox" checked={c.loop} disabled={disabled} onChange={e => patch(x => { if(x.type==="animation") x.loop=e.target.checked; },`${c.id}.loop`)} />הפעלה בלולאה</label><p className="ef-hint">הנגן מכבד העדפת תנועה מופחתת. סרטון אנימציה מופעל ללא שמע.</p>
  </>;
  if (c.type === "reveal") return <>
    <Field label="סדר חשיפת פריטים">{id => <select id={id} value={c.mode} disabled={disabled} onChange={e => patch(x => { if(x.type==="reveal") x.mode=e.target.value as "sequential"|"any"; },`${c.id}.mode`)}><option value="any">בכל סדר</option><option value="sequential">לפי הסדר</option></select>}</Field>
    <label className="ef-check"><input type="checkbox" checked={c.requireAll} disabled={disabled} onChange={e => patch(x => { if(x.type==="reveal") x.requireAll=e.target.checked; },`${c.id}.requireAll`)} />חובה לפתוח את כל הפריטים</label>
    {c.items.map((item,i) => <fieldset key={item.id} disabled={disabled}><legend>פריט חשיפה {i+1}</legend>
      <Field label="כותרת הפריט">{id => <input id={id} value={item.title} onChange={e => patch(x => { if(x.type==="reveal") x.items[i]!.title=e.target.value; },`${c.id}.${item.id}.title`)} />}</Field>
      <Field label="סוג התוכן">{id => <select id={id} value={item.content.kind} onChange={e => patch(x => { if(x.type==="reveal") x.items[i]!.content = e.target.value === "image" ? { kind:"image",media:mediaPlaceholder("תמונה לפריט חשיפה"),alt:"תיאור התמונה" } : { kind:"text",body:textToBlocks("") }; },`${c.id}.${item.id}.kind`)}><option value="text">טקסט מעוצב</option><option value="image">תמונה</option></select>}</Field>
      {item.content.kind === "text" ? <RichTextEditor value={item.content.body} disabled={disabled} onChange={body => patch(x => { if(x.type==="reveal" && x.items[i]!.content.kind==="text") x.items[i]!.content.body=body; },`${c.id}.${item.id}.body`)} /> : <>
        <MediaRefField {...common} label="תמונת פריט" value={item.content.media} kinds={["image"]} onChange={ref => ref && patch(x => { if(x.type==="reveal" && x.items[i]!.content.kind==="image") x.items[i]!.content.media=ref; },`${c.id}.${item.id}.media`)} />
        <Field label="תיאור התמונה">{id => <input id={id} value={item.content.kind==="image" ? item.content.alt : ""} onChange={e => patch(x => { if(x.type==="reveal" && x.items[i]!.content.kind==="image") x.items[i]!.content.alt=e.target.value; },`${c.id}.${item.id}.alt`)} />}</Field>
        <Field label="כיתוב התמונה">{id => <input id={id} value={item.content.kind==="image" ? item.content.caption ?? "" : ""} onChange={e => patch(x => { if(x.type==="reveal" && x.items[i]!.content.kind==="image") x.items[i]!.content.caption=e.target.value || undefined; },`${c.id}.${item.id}.caption`)} />}</Field>
        <Field label="קרדיט לתמונה">{id => <input id={id} value={item.content.kind==="image" ? item.content.credit ?? "" : ""} onChange={e => patch(x => { if(x.type==="reveal" && x.items[i]!.content.kind==="image") x.items[i]!.content.credit=e.target.value || undefined; },`${c.id}.${item.id}.credit`)} />}</Field>
      </>}
      <div className="ef-row"><button type="button" disabled={i===0} onClick={() => patch(x => { if(x.type==="reveal") [x.items[i-1],x.items[i]]=[x.items[i]!,x.items[i-1]!]; },`${c.id}.move`)}>פריט למעלה</button><button type="button" disabled={i===c.items.length-1} onClick={() => patch(x => { if(x.type==="reveal") [x.items[i+1],x.items[i]]=[x.items[i]!,x.items[i+1]!]; },`${c.id}.move`)}>פריט למטה</button><button type="button" disabled={c.items.length<=1} onClick={() => patch(x => { if(x.type==="reveal") x.items.splice(i,1); },`${c.id}.remove`)}>הסרת פריט</button></div>
    </fieldset>)}<button type="button" disabled={disabled || c.items.length>=30} onClick={() => patch(x => { if(x.type==="reveal") x.items.push({ id:newId("i"),title:"פריט חדש",content:{kind:"text",body:[]} }); },`${c.id}.add`)}>הוספת פריט חשיפה</button>
  </>;
  if (c.type === "hotspotExplore" || c.type === "hotspotImage") {
    const editArea = (index:number,fn:(area:Extract<ComponentV2,{type:"hotspotImage"|"hotspotExplore"}>["hotspots"][number])=>void,key:string) => patch(x => { if(x.type==="hotspotImage" || x.type==="hotspotExplore") fn(x.hotspots[index]!); },`${c.id}.${key}`);
    const setShape = (id:string,shape:HotspotShape) => patch(x => { if(x.type==="hotspotExplore" || x.type==="hotspotImage") { const area=x.hotspots.find(h => h.id===id); if(area) area.shape=shape; } },`${c.id}.${id}.shape`);
    return <>
      <MediaRefField {...common} label="תמונה לאזורים לחיצים" value={c.media} kinds={["image"]} onChange={ref => ref && patch(x => { if(x.type==="hotspotExplore" || x.type==="hotspotImage") x.media=ref; },`${c.id}.media`)} />
      <Field label="תיאור התמונה לנגישות">{id => <input id={id} required value={c.alt} disabled={disabled} onChange={e => patch(x => { if(x.type==="hotspotExplore" || x.type==="hotspotImage") x.alt=e.target.value; },`${c.id}.alt`)} />}</Field>
      {c.type==="hotspotImage" && <><Field label="השאלה">{id => <textarea id={id} value={c.prompt} disabled={disabled} onChange={e => patch(x => { if(x.type==="hotspotImage") x.prompt=e.target.value; },`${c.id}.prompt`)} />}</Field><Field label="סוג בחירת אזורים">{id => <select id={id} value={c.mode} disabled={disabled} onChange={e => patch(x => { if(x.type==="hotspotImage") x.mode=e.target.value as "single"|"all"; },`${c.id}.mode`)}><option value="single">אזור אחד</option><option value="all">כל האזורים הנכונים</option></select>}</Field></>}
      {c.type==="hotspotExplore" && <label className="ef-check"><input type="checkbox" checked={c.requireAll} disabled={disabled} onChange={e => patch(x => { if(x.type==="hotspotExplore") x.requireAll=e.target.checked; },`${c.id}.requireAll`)} />חובה לחקור את כל האזורים</label>}
      <HotspotCanvas src={c.media.assetId ? media[c.media.assetId]?.src : undefined} areas={c.hotspots} onAdd={shape=>{const id=newId("h");patch(x=>{const area={id,label:"אזור חדש",shape};if(x.type==="hotspotExplore")x.hotspots.push({...area,title:"אזור חדש",body:[]});if(x.type==="hotspotImage")x.hotspots.push({...area,correct:false});},`${c.id}.draw`);return id;}} onChange={setShape} disabled={disabled} />
      {c.hotspots.map((area,i) => <fieldset key={area.id} disabled={disabled}><legend>אזור {i+1}</legend>
        <Field label="שם האזור לנגישות">{id => <input id={id} value={area.label} onChange={e => editArea(i,a => {a.label=e.target.value;},`${area.id}.label`)} />}</Field>
        <Field label="צורת האזור">{id => <select id={id} value={area.shape.kind} onChange={e => setShape(area.id,e.target.value==="rect" ? {kind:"rect",x:10,y:10,w:30,h:30} : {kind:"circle",cx:50,cy:50,r:15})}><option value="rect">מלבן</option><option value="circle">עיגול</option></select>}</Field>
        {"body" in area ? <><Field label="כותרת תוכן האזור">{id => <input id={id} value={area.title} onChange={e => patch(x => {if(x.type==="hotspotExplore") x.hotspots[i]!.title=e.target.value;},`${c.id}.${area.id}.title`)} />}</Field><RichTextEditor value={area.body} disabled={disabled} onChange={body => patch(x => {if(x.type==="hotspotExplore") x.hotspots[i]!.body=body;},`${c.id}.${area.id}.body`)} /></> : <><label className="ef-check"><input type="checkbox" checked={area.correct} onChange={e => patch(x => {if(x.type==="hotspotImage") x.hotspots[i]!.correct=e.target.checked;},`${c.id}.${area.id}.correct`)} />אזור נכון</label><Field label="משוב לבחירת האזור">{id => <textarea id={id} value={area.feedback ?? ""} onChange={e => patch(x => {if(x.type==="hotspotImage") x.hotspots[i]!.feedback=e.target.value || undefined;},`${c.id}.${area.id}.feedback`)} />}</Field></>}
        <button type="button" disabled={c.hotspots.length<=1} onClick={() => patch(x => {if(x.type==="hotspotExplore" || x.type==="hotspotImage") x.hotspots.splice(i,1);},`${c.id}.remove`)}>הסרת אזור</button>
      </fieldset>)}
      <button type="button" disabled={disabled || c.hotspots.length>=20} onClick={() => patch(x => { const area={id:newId("h"),label:"אזור חדש",shape:{kind:"rect" as const,x:10,y:10,w:20,h:20}}; if(x.type==="hotspotExplore") x.hotspots.push({...area,title:"אזור חדש",body:[]}); if(x.type==="hotspotImage") x.hotspots.push({...area,correct:false}); },`${c.id}.add`)}>הוספת אזור</button>
      {c.type==="hotspotImage" && <fieldset disabled={disabled}><legend>ניקוד ומשוב</legend>{(["points","maxAttempts"] as const).map(key => <Field key={key} label={key==="points" ? "ניקוד" : "ניסיונות"}>{id => <input id={id} type="number" min={key==="points" ? 0 : 1} max={key==="points" ? 100 : 10} value={c[key]} onChange={e => patch(x => {if(x.type==="hotspotImage") x[key]=Number(e.target.value);},`${c.id}.${key}`)} />}</Field>)}{(["correct","incorrect"] as const).map(key => <Field key={key} label={key==="correct" ? "משוב לתשובה נכונה" : "משוב לתשובה שגויה"}>{id => <textarea id={id} value={c.feedback[key]} onChange={e => patch(x => {if(x.type==="hotspotImage") x.feedback[key]=e.target.value;},`${c.id}.feedback.${key}`)} />}</Field>)}<label className="ef-check"><input type="checkbox" checked={c.showCorrectAfterFinalAttempt} onChange={e => patch(x => {if(x.type==="hotspotImage") x.showCorrectAfterFinalAttempt=e.target.checked;},`${c.id}.show`)} />הצגת תשובות נכונות לאחר הניסיון האחרון</label></fieldset>}
    </>;
  }
  if (c.type === "simulation") return <>
    <p role="note" className="form-error">מודול בדיקת תוכנה בלבד — אינו סימולטור AED ואינו ניתן לפרסום ללומדים.</p>
    <p>מודול: {c.module} · גרסת מודול: {c.moduleVersion}</p>
    {c.config.steps.map((text,i) => <Field key={i} label={`שם כפתור בדיקה ${i+1}`}>{id => <input id={id} value={text} disabled={disabled} onChange={e => patch(x => {if(x.type==="simulation") x.config.steps[i]=e.target.value;},`${c.id}.step${i}`)} />}</Field>)}
    <Field label="דגם מכשיר משויך (למטא־דאטה בלבד)">{id => <select id={id} value={c.config.deviceModelId ?? ""} disabled={disabled} onChange={e => patch(x => {if(x.type==="simulation") x.config.deviceModelId=e.target.value || undefined;},`${c.id}.device`)}><option value="">ללא דגם</option>{devices.map(d => <option key={d.id} value={d.id}>{d.name} · {d.status==="verified" ? "מאומת" : "טיוטה"}</option>)}</select>}</Field>
    <label className="ef-check"><input type="checkbox" checked={c.completion.required} disabled={disabled} onChange={e => patch(x => {if(x.type==="simulation") x.completion.required=e.target.checked;},`${c.id}.required`)} />נדרשת השלמת רצף שלושת הכפתורים בתצוגה המקדימה</label>
  </>;
  throw Error(`אין טופס עריכה לרכיב ${c.type}`);
}
