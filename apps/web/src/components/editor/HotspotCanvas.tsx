"use client";
import { useRef, useState } from "react";
import type { HotspotShape } from "@mozes/content-schema";
type Area = { id: string; label: string; shape: HotspotShape };
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));
export function HotspotCanvas({ src, areas, onChange, onAdd, disabled }: { src?: string; areas: Area[]; onChange: (id: string, shape: HotspotShape) => void; onAdd:(shape:HotspotShape)=>string; disabled: boolean }) {
  const canvas = useRef<HTMLDivElement>(null), gesture = useRef<{ id: string; startX: number; startY: number; shape: HotspotShape; resize: boolean } | null>(null);
  const [selected, setSelected] = useState(areas[0]?.id ?? ""), [announce, setAnnounce] = useState("");
  const [drawMode,setDrawMode]=useState<"rect"|"circle"|null>(null),[draftShape,setDraftShape]=useState<HotspotShape|null>(null),drawStart=useRef<{x:number;y:number}|null>(null);
  const point=(event:React.PointerEvent)=>{const r=canvas.current!.getBoundingClientRect();return {x:clamp((event.clientX-r.left)/r.width*100,0,100),y:clamp((event.clientY-r.top)/r.height*100,0,100)};};
  const drawMove=(event:React.PointerEvent<HTMLDivElement>)=>{if(!drawMode || !drawStart.current)return;const p=point(event),start=drawStart.current;if(drawMode==="rect"){const w=Math.abs(p.x-start.x),h=Math.abs(p.y-start.y);setDraftShape(w>=1&&h>=1 ? {kind:"rect",x:Math.min(start.x,p.x),y:Math.min(start.y,p.y),w,h} : null);}else {const r=Math.min(50,Math.hypot(p.x-start.x,p.y-start.y),start.x,100-start.x,start.y,100-start.y);setDraftShape(r>=1 ? {kind:"circle",cx:start.x,cy:start.y,r} : null);}};
  const shapeStyle=(s:HotspotShape):React.CSSProperties=>s.kind==="rect" ? {left:`${s.x}%`,top:`${s.y}%`,width:`${s.w}%`,height:`${s.h}%`} : {left:`${s.cx}%`,top:`${s.cy}%`,width:`${s.r*2}%`,aspectRatio:1,borderRadius:"50%",transform:"translate(-50%,-50%)"};
  const selectedArea = areas.find(a => a.id === selected) ?? areas[0];
  const start = (e: React.PointerEvent<HTMLButtonElement>, area: Area, resize = false) => {
    if(disabled) return; e.preventDefault(); e.stopPropagation(); e.currentTarget.setPointerCapture(e.pointerId); setSelected(area.id);
    gesture.current = { id:area.id, startX:e.clientX, startY:e.clientY, shape: structuredClone(area.shape), resize };
  };
  const move = (e: React.PointerEvent<HTMLButtonElement>) => {
    const g = gesture.current, rect = canvas.current?.getBoundingClientRect(); if (!g || !rect || !rect.width || !rect.height) return;
    const dx = (e.clientX-g.startX)/rect.width*100, dy = (e.clientY-g.startY)/rect.height*100, s = g.shape;
    let next: HotspotShape;
    if (s.kind === "rect") next = g.resize ? { ...s, w: clamp(s.w+dx,1,100-s.x), h: clamp(s.h+dy,1,100-s.y) } : { ...s, x:clamp(s.x+dx,0,100-s.w),y:clamp(s.y+dy,0,100-s.h) };
    else next = g.resize ? { ...s, r:clamp(s.r+dx,1,Math.min(50,s.cx,100-s.cx,s.cy,100-s.cy)) } : { ...s,cx:clamp(s.cx+dx,s.r,100-s.r),cy:clamp(s.cy+dy,s.r,100-s.r) };
    onChange(g.id,next);
  };
  const end = () => { if (gesture.current) setAnnounce("מיקום האזור עודכן. אפשר לדייק באמצעות השדות המספריים."); gesture.current = null; };
  const update = (key: string, value: number) => { if (!selectedArea || !Number.isFinite(value)) return; const s = selectedArea.shape;
    if (s.kind === "rect") { const next = { ...s, [key]: clamp(value,key === "w" || key === "h" ? 1 : 0,100) }; next.w = Math.min(next.w,100-next.x); next.h = Math.min(next.h,100-next.y); if(next.w>=1 && next.h>=1) onChange(selectedArea.id,next); }
    else { const next = { ...s, [key]: clamp(value,key === "r" ? 1 : 0,key === "r" ? 50 : 100) }; next.r = Math.min(next.r,next.cx,100-next.cx,next.cy,100-next.cy); if(next.r>=1) onChange(selectedArea.id,next); }
  };
  return <div className="v2-hotspot-editor">
    <p className="ef-hint">גררו אזור להזזה ואת הידית לשינוי גודל. אפשר לבחור אזור ולהזין מיקום וגודל באחוזים באמצעות המקלדת.</p>
    {src && <div className="ef-row"><button type="button" disabled={disabled||areas.length>=20} aria-pressed={drawMode==="rect"} onClick={()=>setDrawMode(drawMode==="rect" ? null : "rect")}>ציור מלבן חדש</button><button type="button" disabled={disabled||areas.length>=20} aria-pressed={drawMode==="circle"} onClick={()=>setDrawMode(drawMode==="circle" ? null : "circle")}>ציור עיגול חדש</button></div>}
    {drawMode && <p role="status">גררו על התמונה לציור אזור חדש. לחצו שוב על כפתור הציור לביטול.</p>}
    {src ? <div className={`v2-hotspot-canvas${drawMode ? " is-drawing" : ""}`} ref={canvas} dir="ltr" onPointerDown={event=>{if(!drawMode||disabled||areas.length>=20)return;if(event.target instanceof HTMLElement && event.target.closest("button"))return;event.preventDefault();event.currentTarget.setPointerCapture(event.pointerId);drawStart.current=point(event);setDraftShape(null);}} onPointerMove={drawMove} onPointerUp={()=>{if(drawStart.current&&draftShape){setSelected(onAdd(draftShape));setAnnounce("אזור חדש נוצר על התמונה.");}drawStart.current=null;setDraftShape(null);setDrawMode(null);}} onPointerCancel={()=>{drawStart.current=null;setDraftShape(null);}}>
      <img src={src} alt="תמונה למיקום אזורים" draggable={false} />
      {areas.map(area => { const s = area.shape, style: React.CSSProperties = s.kind === "rect" ? { left:`${s.x}%`,top:`${s.y}%`,width:`${s.w}%`,height:`${s.h}%` } : { left:`${s.cx}%`,top:`${s.cy}%`,width:`${s.r*2}%`,aspectRatio:1,borderRadius:"50%",transform:"translate(-50%,-50%)" };
        return <div key={area.id} className={`v2-canvas-area${selectedArea?.id === area.id ? " is-selected" : ""}`} style={style}>
          <button type="button" className="v2-area-move" disabled={disabled} aria-label={`בחירה והזזה: ${area.label}`} onClick={() => setSelected(area.id)} onPointerDown={e => start(e,area)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>{area.label}</button>
          <button type="button" className="v2-area-resize" disabled={disabled} aria-label={`שינוי גודל: ${area.label}`} onPointerDown={e => start(e,area,true)} onPointerMove={move} onPointerUp={end} onPointerCancel={end}>↔</button>
        </div>;
      })}
      {draftShape && <div className="v2-canvas-area is-draft" aria-hidden="true" style={shapeStyle(draftShape)} />}
    </div> : <p role="status">בחרו תמונה כדי לצייר עליה אזורים. אפשר להזין מידות כבר עכשיו.</p>}
    <label>אזור לעריכה<select value={selectedArea?.id ?? ""} disabled={disabled} onChange={e => setSelected(e.target.value)}>{areas.map(a => <option value={a.id} key={a.id}>{a.label}</option>)}</select></label>
    {selectedArea && <div className="ef-row">{(selectedArea.shape.kind === "rect" ? ["x","y","w","h"] : ["cx","cy","r"]).map(key => <label key={key}>{({x:"מרחק משמאל",y:"מרחק מלמעלה",w:"רוחב",h:"גובה",cx:"מרכז אופקי",cy:"מרכז אנכי",r:"רדיוס"} as Record<string,string>)[key]} (%)<input type="number" min={key === "w" || key === "h" || key === "r" ? 1 : 0} max={100} step={.5} value={(selectedArea.shape as unknown as Record<string,number>)[key]} disabled={disabled} onChange={e => update(key,Number(e.target.value))} /></label>)}</div>}
    <p className="sr-only" aria-live="polite">{announce}</p>
  </div>;
}
