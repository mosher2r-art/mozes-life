"use client";
import { useId } from "react";
import type { Block, Inline } from "@mozes/content-schema";
/** Structured controls preserve inline styles and list ordering without injecting HTML. */
export function RichTextEditor({ value, onChange, disabled = false }: { value: Block[]; onChange: (value: Block[]) => void; disabled?: boolean }) {
  const prefix = useId();
  const edit = (fn: (draft: Block[]) => void) => { const copy = structuredClone(value); fn(copy); onChange(copy); };
  const inlines = (items: Inline[], blockIndex: number, itemIndex?: number) => {
    const update = (fn: (list: Inline[]) => void) => edit(draft => { const block = draft[blockIndex]!; fn(block.kind === "paragraph" ? block.content : block.items[itemIndex ?? 0]!); });
    return <div>{items.map((span, i) => <div className="v2-inline" key={i}>
      <label htmlFor={`${prefix}-${blockIndex}-${itemIndex ?? "p"}-${i}`}>קטע טקסט {i + 1}</label>
      <textarea id={`${prefix}-${blockIndex}-${itemIndex ?? "p"}-${i}`} value={span.text} disabled={disabled} rows={2} onChange={e => update(list => { list[i]!.text = e.target.value; })} />
      <div className="ef-row">
        <label className="ef-check"><input type="checkbox" checked={span.bold ?? false} disabled={disabled} onChange={e => update(list => { list[i]!.bold = e.target.checked || undefined; })} />מודגש</label>
        <label className="ef-check"><input type="checkbox" checked={span.italic ?? false} disabled={disabled} onChange={e => update(list => { list[i]!.italic = e.target.checked || undefined; })} />נטוי</label>
        <label>קישור<input type="url" value={span.href ?? ""} disabled={disabled} onChange={e => update(list => { list[i]!.href = e.target.value || undefined; })} /></label>
        <button type="button" disabled={disabled || items.length <= 1} onClick={() => update(list => list.splice(i, 1))}>הסרת קטע</button>
      </div>
    </div>)}<button type="button" disabled={disabled} onClick={() => update(list => list.push({ text: "" }))}>הוספת קטע טקסט</button></div>;
  };
  return <div className="v2-rich-editor">{value.map((block, i) => <fieldset key={i} disabled={disabled}>
    <legend>{block.kind === "paragraph" ? `פסקה ${i + 1}` : `רשימה ${i + 1}`}</legend>
    {block.kind === "paragraph" ? inlines(block.content, i) : <>
      <label className="ef-check"><input type="checkbox" checked={block.ordered} onChange={e => edit(d => { const b = d[i]!; if(b.kind === "list") b.ordered = e.target.checked; })} />רשימה ממוספרת</label>
      {block.items.map((item, j) => <fieldset key={j}><legend>פריט {j + 1}</legend>{inlines(item, i, j)}<button type="button" disabled={block.items.length <= 1} onClick={() => edit(d => { const b = d[i]!; if(b.kind === "list") b.items.splice(j,1); })}>הסרת פריט</button></fieldset>)}
      <button type="button" onClick={() => edit(d => { const b = d[i]!; if(b.kind === "list") b.items.push([{ text: "" }]); })}>הוספת פריט לרשימה</button>
    </>}
    <div className="ef-row"><button type="button" disabled={i === 0} onClick={() => edit(d => { [d[i-1],d[i]] = [d[i]!,d[i-1]!]; })}>פסקה למעלה</button><button type="button" disabled={i === value.length-1} onClick={() => edit(d => { [d[i+1],d[i]] = [d[i]!,d[i+1]!]; })}>פסקה למטה</button><button type="button" onClick={() => edit(d => d.splice(i,1))}>הסרת פסקה</button></div>
  </fieldset>)}
  <div className="ef-row"><button type="button" disabled={disabled} onClick={() => onChange([...value, { kind: "paragraph", content: [{ text: "" }] }])}>הוספת פסקה</button><button type="button" disabled={disabled} onClick={() => onChange([...value, { kind: "list", ordered: false, items: [[{ text: "" }]] }])}>הוספת רשימה</button></div></div>;
}
