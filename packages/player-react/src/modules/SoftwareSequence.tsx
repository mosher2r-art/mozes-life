"use client";
import type { ComponentOf } from "@mozes/content-schema";
import { usePlayer } from "../context";
/** A software acceptance fixture. No device behaviour, medical guidance or publication. */
export default function SoftwareSequence({ c }: { c: ComponentOf<"simulation"> }) {
  const { state, dispatch } = usePlayer(), simulation = state.simulations?.[c.id];
  const result = simulation?.events.filter(event => event.type === "completed").at(-1);
  return <section className="mp-simulation" aria-label="בדיקת תוכנה בלבד"><p className="mp-notice">מודול בדיקה לא רפואי — אינו מדמה מכשיר AED ואינו ניתן לפרסום.</p><p>לחצו על שלושת הכפתורים לפי הסדר המוצג. התשובות נבדקות במנוע.</p>{!simulation?.started ? <button type="button" className="mp-btn mp-btn-primary" onClick={() => dispatch({ type: "simulation_start", componentId: c.id })}>התחלת בדיקת התוכנה</button> : <><div className="mp-simulation-actions">{c.config.steps.map((label, action) => <button key={action} type="button" className="mp-btn mp-btn-secondary" disabled={simulation.completed} onClick={() => dispatch({ type: "simulation_step", componentId: c.id, action })}>{action + 1}. {label}</button>)}</div><p role="status">{simulation.completed ? `הבדיקה הושלמה. טעויות: ${simulation.mistakes}${result?.type === "completed" ? `; ציון בדיקה: ${result.score}` : ""}` : `השלב הבא: ${simulation.nextStep + 1} מתוך 3. טעויות: ${simulation.mistakes}`}</p><button type="button" className="mp-btn" onClick={() => dispatch({ type: "simulation_reset", componentId: c.id })}>התחלה מחדש</button></>}</section>;
}
