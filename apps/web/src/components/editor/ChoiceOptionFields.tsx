"use client";
import type { ChoiceOptionV2 } from "@mozes/content-schema";
import { Field } from "./EditorField";
import { MediaRefField, type EditorMedia, type PickEditorMedia } from "./MediaRefField";
export function ChoiceOptionFields({ option, variables, edit, media, pickMedia, disabled, decision }: { option:ChoiceOptionV2;variables:Record<string,string|number|boolean>;edit:(fn:(option:ChoiceOptionV2)=>void)=>void;media:EditorMedia;pickMedia:PickEditorMedia;disabled:boolean;decision:boolean }) {
  return <details><summary>תמונת תשובה{decision ? " ומשתני תרחיש" : ""}</summary>
    <MediaRefField label="תמונה לאפשרות תשובה" value={option.image} media={media} kinds={["image"]} pickMedia={pickMedia} disabled={disabled} optional onChange={ref => edit(o => {o.image=ref;})} />
    {option.image && <Field label="תיאור תמונת התשובה לנגישות">{id => <input id={id} value={option.imageAlt ?? ""} disabled={disabled} onChange={e => edit(o => {o.imageAlt=e.target.value;})} />}</Field>}
    {decision && Object.entries(variables).map(([name, initial]) => {
      const assigned = Object.hasOwn(option.setVariables ?? {},name), value = option.setVariables?.[name] ?? initial;
      return <fieldset key={name} disabled={disabled}><legend>משתנה {name}</legend>
        <label className="ef-check"><input type="checkbox" checked={assigned} onChange={e => edit(o => {const next={...o.setVariables};if(e.target.checked) next[name]=initial;else delete next[name];o.setVariables=Object.keys(next).length ? next : undefined;})} />עדכון המשתנה בבחירה זו</label>
        {assigned && <Field label={`ערך חדש של ${name}`}>{id => typeof initial === "boolean" ? <select id={id} value={String(value)} onChange={e => edit(o => {o.setVariables={...o.setVariables,[name]:e.target.value==="true"};})}><option value="false">לא</option><option value="true">כן</option></select> : <input id={id} type={typeof initial==="number" ? "number" : "text"} value={String(value)} onChange={e => edit(o => {o.setVariables={...o.setVariables,[name]:typeof initial==="number" ? Number(e.target.value) : e.target.value};})} />}</Field>}
      </fieldset>;
    })}
    {decision && !Object.keys(variables).length && <p className="ef-hint">אפשר להגדיר משתנים בהגדרות התרחיש של הפרק.</p>}
  </details>;
}
