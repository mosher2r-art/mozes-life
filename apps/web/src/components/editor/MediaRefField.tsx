"use client";
import type { ResolvedMedia } from "@mozes/player-react";
import type { CaptionsV2, CaptionTrack, MediaRefV2 } from "@mozes/content-schema";
import type { AssetView } from "@/components/media/upload";
import { Field } from "./EditorField";
import { newId } from "./ops";
export type EditorMedia = Record<string, ResolvedMedia>;
export type PickEditorMedia = (kinds: AssetView["kind"][], title: string, onPick: (asset: AssetView) => void) => void;
export const mediaPlaceholder = (description: string): MediaRefV2 => ({ placeholder: { requestId: newId("request"), description } });
export function MediaRefField({ label, value, media, kinds, pickMedia, onChange, disabled, optional = false }: { label: string; value?: MediaRefV2; media: EditorMedia; kinds: AssetView["kind"][]; pickMedia: PickEditorMedia; onChange: (ref: MediaRefV2 | undefined, asset?: AssetView) => void; disabled: boolean; optional?: boolean }) {
  const resolved = value?.assetId ? media[value.assetId] : null, placeholder = value && "placeholder" in value ? value.placeholder : null;
  return <fieldset className="v2-media-ref" disabled={disabled}><legend>{label}</legend>
    {resolved?.mime?.startsWith("image/") && <img className="v2-media-preview" src={resolved.src} alt="תצוגה מקדימה של המדיה הנבחרת" />}
    <p className="ef-hint">{value?.assetId ? `נכס נבחר: ${value.assetId}` : placeholder ? "מקום שמור — חוסם פרסום עד להשלמת המדיה" : "לא נבחר נכס"}</p>
    <div className="ef-row"><button type="button" className="btn btn-quiet btn-sm" onClick={() => pickMedia(kinds,label,a => onChange({ assetId:a.id },a))}>{value?.assetId ? "החלפה" : "בחירה"}</button><button type="button" className="btn btn-quiet btn-sm" onClick={() => onChange(mediaPlaceholder(label))}>הגדרת מקום שמור</button>{optional && value && <button type="button" className="ed-link-danger" onClick={() => onChange(undefined)}>הסרה</button>}</div>
    {placeholder && <>
      <Field label="תיאור המדיה המבוקשת">{id => <textarea id={id} required rows={2} value={placeholder.description} onChange={e => onChange({ placeholder: { ...placeholder,description:e.target.value } })} />}</Field>
      <Field label="מזהה בקשת מדיה" hint="מזהה ייחודי בתוך הפרק; אותיות באנגלית, ספרות, מקף או קו תחתון.">{id => <input id={id} required dir="ltr" value={placeholder.requestId} maxLength={64} pattern="[A-Za-z0-9_-]+" onChange={e => onChange({ placeholder: { ...placeholder,requestId:e.target.value } })} />}</Field>
    </>}
  </fieldset>;
}
export function CaptionTracksEditor({ value, onChange, ...props }: { value?: CaptionsV2; onChange: (value: CaptionsV2 | undefined) => void; media: EditorMedia; pickMedia: PickEditorMedia; disabled: boolean }) {
  const tracks: CaptionTrack[] = !value ? [] : Array.isArray(value) ? value : [{ media:value,language:"he",label:"עברית",default:true }];
  const edit = (index: number, fn: (track: CaptionTrack) => void) => { const next = structuredClone(tracks); fn(next[index]!); onChange(next); };
  return <fieldset disabled={props.disabled}><legend>כתוביות (VTT, מומלץ)</legend>{tracks.map((track,i) => <fieldset key={i}><legend>מסלול כתוביות {i+1}</legend>
    <MediaRefField {...props} label="קובץ כתוביות" value={track.media} kinds={["captions"]} onChange={ref => ref && edit(i,t => { t.media=ref; })} />
    <div className="ef-row"><Field label="שפת הכתוביות">{id => <input id={id} dir="ltr" value={track.language} onChange={e => edit(i,t => { t.language=e.target.value; })} />}</Field><Field label="שם השפה להצגה">{id => <input id={id} value={track.label} onChange={e => edit(i,t => { t.label=e.target.value; })} />}</Field></div>
    <label className="ef-check"><input type="checkbox" checked={track.default} onChange={e => onChange(tracks.map((t,j) => ({ ...t,default:j===i ? e.target.checked : false })))} />ברירת מחדל</label>
    <button type="button" onClick={() => onChange(tracks.length===1 ? undefined : tracks.filter((_,j) => i!==j))}>הסרת מסלול כתוביות</button>
  </fieldset>)}<button type="button" disabled={props.disabled || tracks.length>=10} onClick={() => onChange([...tracks,{ media:mediaPlaceholder("כתוביות VTT"),language:"he",label:"עברית",default:!tracks.length }])}>הוספת שפת כתוביות</button></fieldset>;
}
