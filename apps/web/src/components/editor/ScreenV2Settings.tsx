"use client";
import { ScreenV2, type Screen, type ScreenV2 as ScreenData } from "@mozes/content-schema";
import { Field } from "./EditorField";
import { MediaRefField, mediaPlaceholder, type EditorMedia, type PickEditorMedia } from "./MediaRefField";
export function ScreenV2Settings({ screen, patch, media, pickMedia, disabled }: { screen:Screen;patch:(fn:(screen:ScreenData)=>void,key:string)=>void;media:EditorMedia;pickMedia:PickEditorMedia;disabled:boolean }) {
  const s = ScreenV2.parse(screen), common={media,pickMedia,disabled}, components=Object.values(s.slots).flat();
  return <>
    <details className="v2-screen-settings"><summary>קריינות ותזמון הופעת התוכן</summary>
      <label className="ef-check"><input type="checkbox" checked={!!s.narration} disabled={disabled} onChange={e => patch(x => {x.narration=e.target.checked ? {media:mediaPlaceholder("קריינות המסך"),cues:[],autoplay:true} : undefined;},`${s.id}.narration`)} />קריינות למסך</label>
      {s.narration && <>
        <MediaRefField {...common} label="הקלטת קריינות" value={s.narration.media} kinds={["audio"]} onChange={ref => ref && patch(x => {if(x.narration) x.narration.media=ref;},`${s.id}.narration.media`)} />
        <MediaRefField {...common} label="כתוביות קריינות VTT" value={s.narration.captions} kinds={["captions"]} optional onChange={ref => patch(x => {if(x.narration) x.narration.captions=ref;},`${s.id}.narration.captions`)} />
        <label className="ef-check"><input type="checkbox" checked={s.narration.autoplay} disabled={disabled} onChange={e => patch(x => {if(x.narration) x.narration.autoplay=e.target.checked;},`${s.id}.narration.autoplay`)} />ניסיון הפעלת קריינות בכניסה למסך</label>
        <p className="ef-hint">רכיב שאין לו זמן הופעה מוצג מיד. אפשר להשתיק קריינות ולהציג את כל התוכן בנגן.</p>
        {s.narration.cues.map((cue,i) => <fieldset key={`${cue.componentId}-${i}`} disabled={disabled}><legend>תזמון {i+1}</legend><div className="ef-row">
          <Field label="רכיב להצגה">{id => <select id={id} value={cue.componentId} onChange={e => patch(x => {if(x.narration) x.narration.cues[i]!.componentId=e.target.value;},`${s.id}.cue${i}.component`)}>{components.map(c => <option key={c.id} value={c.id}>{"text" in c ? c.text : "prompt" in c ? c.prompt : c.type} ({c.id})</option>)}</select>}</Field>
          <Field label="זמן הופעה בשניות">{id => <input id={id} type="number" min={0} step={.1} value={cue.atMs/1000} onChange={e => patch(x => {if(x.narration) {x.narration.cues[i]!.atMs=Math.max(0,Math.round(Number(e.target.value)*1000));x.narration.cues.sort((a,b)=>a.atMs-b.atMs);}},`${s.id}.cue${i}.time`)} />}</Field>
        </div><button type="button" onClick={() => patch(x => {x.narration?.cues.splice(i,1);},`${s.id}.cue.remove`)}>הסרת תזמון</button></fieldset>)}
        <button type="button" disabled={disabled || !components.some(c => !s.narration!.cues.some(cue => cue.componentId===c.id))} onClick={() => patch(x => {const c=components.find(c => !x.narration!.cues.some(cue => cue.componentId===c.id));if(c && x.narration) x.narration.cues.push({componentId:c.id,atMs:(x.narration.cues.at(-1)?.atMs ?? 0)+1000});},`${s.id}.cue.add`)}>הוספת תזמון לרכיב</button>
      </>}
    </details>
    {s.medical.relevant && <details className="v2-screen-settings" open><summary>מקורות רפואיים למסך</summary>
      <p className="ef-hint">ציינו מקורות ותאריך. האישור עצמו ניתן בשרת על ידי בעל הרשאה לאחר בדיקת תוכן המסך.</p>
      {(s.medical.sources ?? []).map((source,i) => <fieldset key={i} disabled={disabled}><legend>מקור {i+1}</legend>
        <Field label="שם המקור הרפואי">{id => <input id={id} required value={source.title} onChange={e => patch(x => {x.medical.sources![i]!.title=e.target.value;},`${s.id}.source${i}.title`)} />}</Field>
        <Field label="קישור HTTPS למקור">{id => <input id={id} required type="url" dir="ltr" value={source.url} onChange={e => patch(x => {x.medical.sources![i]!.url=e.target.value;},`${s.id}.source${i}.url`)} />}</Field>
        <Field label="תאריך המקור או הבדיקה">{id => <input id={id} required type="date" value={source.date} onChange={e => patch(x => {x.medical.sources![i]!.date=e.target.value;},`${s.id}.source${i}.date`)} />}</Field>
        <button type="button" onClick={() => patch(x => {x.medical.sources!.splice(i,1);},`${s.id}.source.remove`)}>הסרת מקור</button>
      </fieldset>)}<button type="button" disabled={disabled || (s.medical.sources?.length ?? 0)>=30} onClick={() => patch(x => {x.medical.sources=[...x.medical.sources ?? [],{title:"מקור רפואי",url:"https://",date:new Date().toISOString().slice(0,10)}];},`${s.id}.source.add`)}>הוספת מקור רפואי</button>
    </details>}
  </>;
}
