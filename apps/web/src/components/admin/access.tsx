"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState } from "react";

export interface GrantRowView {
  id: string;
  courseTitle: string;
  subject: string;
  validFrom: string;
  validUntil: string | null;
  state: "active" | "scheduled" | "expired" | "revoked";
}
export interface CourseOption {
  id: string;
  title: string;
}

const STATE = { active: { t: "פעיל", c: "chip-done" }, scheduled: { t: "עתידי", c: "chip-progress" }, expired: { t: "הסתיים", c: "chip-neutral" }, revoked: { t: "בוטל", c: "chip-fail" } } as const;
const fmt = (d: string) => new Intl.DateTimeFormat("he-IL", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${d}T12:00:00`));

/** "YYYY-MM-DD" in Israel time. */
export function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jerusalem", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}
/** Last day of a period of `months` starting on `from` (e.g. 1 Jan + 3 months → 31 Mar). */
export function endAfterMonths(from: string, months: number): string {
  const [y, m, d] = from.split("-").map(Number) as [number, number, number];
  const end = new Date(Date.UTC(y, m - 1 + months, d));
  end.setUTCDate(end.getUTCDate() - 1);
  return end.toISOString().slice(0, 10);
}

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: { "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  return { ok: res.ok, data: (await res.json().catch(() => ({}))) as Record<string, unknown> };
}

/** Period picker: start date + 3/6/12 months, unlimited or a custom end date. */
export function PeriodFields({ from, setFrom, until, setUntil }: { from: string; setFrom: (v: string) => void; until: string | null; setUntil: (v: string | null) => void }) {
  const id = useId();
  const [preset, setPreset] = useState<string>("3");
  const apply = (p: string, f = from) => {
    setPreset(p);
    if (p === "none") setUntil(null);
    else if (p !== "custom") setUntil(endAfterMonths(f, Number(p)));
  };
  return (
    <div className="period">
      <div className="field">
        <label htmlFor={`${id}-from`}>מתאריך</label>
        <input id={`${id}-from`} type="date" value={from} required onChange={(e) => { setFrom(e.target.value); if (preset !== "custom" && preset !== "none") setUntil(endAfterMonths(e.target.value, Number(preset))); }} />
      </div>
      <div className="field">
        <label htmlFor={`${id}-len`}>משך הגישה</label>
        <select id={`${id}-len`} value={preset} onChange={(e) => apply(e.target.value)}>
          <option value="1">חודש</option>
          <option value="3">3 חודשים</option>
          <option value="6">6 חודשים</option>
          <option value="12">שנה</option>
          <option value="none">ללא הגבלה</option>
          <option value="custom">עד תאריך מסוים</option>
        </select>
      </div>
      <div className="field">
        <label htmlFor={`${id}-until`}>עד תאריך (כולל)</label>
        <input id={`${id}-until`} type="date" value={until ?? ""} min={from} disabled={preset !== "custom"} onChange={(e) => setUntil(e.target.value || null)} />
      </div>
    </div>
  );
}

function CoursePicker({ courses, selected, setSelected }: { courses: CourseOption[]; selected: string[]; setSelected: (v: string[]) => void }) {
  if (!courses.length) return <p className="muted">אין עדיין קורסים מפורסמים.</p>;
  return (
    <fieldset className="course-picks">
      <legend>קורסים</legend>
      {courses.map((c) => (
        <label key={c.id} className="ef-check">
          <input type="checkbox" checked={selected.includes(c.id)} onChange={(e) => setSelected(e.target.checked ? [...selected, c.id] : selected.filter((x) => x !== c.id))} />
          {c.title}
        </label>
      ))}
    </fieldset>
  );
}

/** Grant one or more courses to an organization or a single user, for a period. */
export function GrantForm({
  courses,
  orgId,
  userId,
  orgs,
  fixedCourseId,
  title,
}: {
  courses: CourseOption[];
  orgId?: string;
  userId?: string;
  /** Choose the organization in the form (used on a course's page). */
  orgs?: { id: string; name: string }[];
  /** Grant only this course (no course picker). */
  fixedCourseId?: string;
  title: string;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<string[]>(fixedCourseId ? [fixedCourseId] : []);
  const [chosenOrg, setChosenOrg] = useState(orgs?.[0]?.id ?? "");
  const fid = useId();
  const [from, setFrom] = useState(todayIso());
  const [until, setUntil] = useState<string | null>(endAfterMonths(todayIso(), 3));
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [pending, setPending] = useState(false);
  return (
    <form className="block access-form" onSubmit={async (e) => {
      e.preventDefault();
      setPending(true);
      setMsg(null);
      const target = orgs ? { orgId: chosenOrg } : orgId ? { orgId } : { userIds: [userId] };
      const r = await call("/api/studio/access", "POST", { courseIds: selected, ...target, validFrom: from, validUntil: until });
      setPending(false);
      if (r.ok) { if (!fixedCourseId) setSelected([]); setMsg({ tone: "ok", text: "הגישה נוספה." }); router.refresh(); }
      else setMsg({ tone: "bad", text: String(r.data.message ?? "הפעולה נכשלה.") });
    }}>
      <h2 className="form-title">{title}</h2>
      {orgs && (
        orgs.length ? (
          <div className="field">
            <label htmlFor={`${fid}-org`}>ארגון</label>
            <select id={`${fid}-org`} value={chosenOrg} onChange={(e) => setChosenOrg(e.target.value)}>
              {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
            </select>
          </div>
        ) : <p className="muted">אין עדיין ארגונים. צרו ארגון במסך הארגונים.</p>
      )}
      {!fixedCourseId && <CoursePicker courses={courses} selected={selected} setSelected={setSelected} />}
      <PeriodFields from={from} setFrom={setFrom} until={until} setUntil={setUntil} />
      <button className="btn btn-primary" type="submit" disabled={pending || !selected.length || (!!orgs && !chosenOrg)}>{pending ? "שומר…" : "מתן גישה"}</button>
      {msg && <p className={msg.tone === "ok" ? "form-ok" : "form-error"} role={msg.tone === "ok" ? "status" : "alert"}>{msg.text}</p>}
    </form>
  );
}

/** Table of access grants with extend and cancel. */
export function GrantTable({ grants, showSubject, showCourse = true }: { grants: GrantRowView[]; showSubject?: boolean; showCourse?: boolean }) {
  const router = useRouter();
  const [editing, setEditing] = useState<string | null>(null);
  const [date, setDate] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  if (!grants.length) return <p className="muted">עדיין אין הרשאות גישה.</p>;
  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            {showCourse && <th scope="col">קורס</th>}
            {showSubject && <th scope="col">למי</th>}
            <th scope="col">מתאריך</th>
            <th scope="col">עד תאריך</th>
            <th scope="col">מצב</th>
            <th scope="col"><span className="visually-hidden">פעולות</span></th>
          </tr>
        </thead>
        <tbody>
          {grants.map((g) => (
            <tr key={g.id}>
              {showCourse && <th scope="row">{g.courseTitle}</th>}
              {showSubject && <td>{g.subject}</td>}
              <td className="num">{fmt(g.validFrom)}</td>
              <td className="num">{g.validUntil ? fmt(g.validUntil) : "ללא הגבלה"}</td>
              <td><span className={`chip ${STATE[g.state].c}`}>{STATE[g.state].t}</span></td>
              <td className="table-actions">
                {editing === g.id ? (
                  <span className="row-actions">
                    <label className="visually-hidden" htmlFor={`until-${g.id}`}>תאריך סיום חדש</label>
                    <input id={`until-${g.id}`} type="date" value={date} min={g.validFrom} onChange={(e) => setDate(e.target.value)} />
                    <button type="button" className="btn btn-quiet btn-sm" onClick={async () => { await call(`/api/studio/access/${g.id}`, "PATCH", { validUntil: date || null }); setEditing(null); router.refresh(); }}>שמירה</button>
                    <button type="button" className="ed-link" onClick={() => setEditing(null)}>ביטול</button>
                  </span>
                ) : confirm === g.id ? (
                  <span className="row-actions">
                    <span className="muted">לבטל את הגישה מיד?</span>
                    <button type="button" className="ed-link-danger" onClick={async () => { await call(`/api/studio/access/${g.id}`, "PATCH", { revoke: true }); setConfirm(null); router.refresh(); }}>ביטול גישה</button>
                    <button type="button" className="ed-link" onClick={() => setConfirm(null)}>לא</button>
                  </span>
                ) : (
                  <span className="row-actions">
                    <button type="button" className="ed-link" onClick={() => { setEditing(g.id); setDate(g.validUntil ?? ""); }}>{g.state === "expired" || g.state === "revoked" ? "חידוש" : "שינוי תאריך סיום"}</button>
                    {(g.state === "active" || g.state === "scheduled") && <button type="button" className="ed-link-danger" onClick={() => setConfirm(g.id)}>ביטול</button>}
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

interface BulkRow { line: number; name: string; email: string; status: "created" | "existing" | "invalid"; password?: string; raw?: string }

/**
 * Paste a list of people (from Excel or email). Missing accounts are created with temporary
 * passwords; everyone is added to the organization, or granted the chosen courses directly.
 */
export function PeopleImport({ orgId, courses, title, endpoint }: { orgId?: string; courses?: CourseOption[]; title: string; endpoint?: string }) {
  const router = useRouter();
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>(courses && courses.length === 1 ? [courses[0]!.id] : []);
  const [from, setFrom] = useState(todayIso());
  const [until, setUntil] = useState<string | null>(endAfterMonths(todayIso(), 3));
  const [results, setResults] = useState<BulkRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const counts = useMemo(() => ({ created: results?.filter((r) => r.status === "created").length ?? 0, existing: results?.filter((r) => r.status === "existing").length ?? 0, invalid: results?.filter((r) => r.status === "invalid").length ?? 0 }), [results]);
  const csv = useMemo(() => {
    const rows = (results ?? []).filter((r) => r.status === "created").map((r) => [r.name, r.email, r.password ?? ""].map((v) => `"${v.replace(/"/g, '""')}"`).join(","));
    return `﻿שם,אימייל,סיסמה זמנית\n${rows.join("\n")}`;
  }, [results]);
  const id = useId();
  return (
    <form className="block access-form" onSubmit={async (e) => {
      e.preventDefault();
      setPending(true);
      setError(null);
      setResults(null);
      const r = endpoint
        ? await call(endpoint, "POST", { text })
        : await call("/api/studio/people", "POST", { text, ...(orgId ? { orgId } : { courseIds: selected, validFrom: from, validUntil: until }) });
      setPending(false);
      if (r.ok) { setResults(r.data.results as BulkRow[]); setText(""); router.refresh(); }
      else setError(String(r.data.message ?? "הפעולה נכשלה."));
    }}>
      <h2 className="form-title">{title}</h2>
      <div className="field">
        <label htmlFor={`${id}-list`}>רשימת אנשים — אחד בכל שורה</label>
        <textarea id={`${id}-list`} rows={6} dir="auto" value={text} onChange={(e) => setText(e.target.value)} placeholder={"dana@example.com\nיוסי כהן, yossi@example.com"} required />
        <p className="ef-hint">אפשר להדביק עמודות מאקסל (שם ואימייל). מי שאין לו חשבון — ייווצר לו חשבון עם סיסמה זמנית.</p>
      </div>
      {!orgId && courses && (
        <>
          <CoursePicker courses={courses} selected={selected} setSelected={setSelected} />
          <PeriodFields from={from} setFrom={setFrom} until={until} setUntil={setUntil} />
        </>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending || !text.trim() || (!orgId && !selected.length)}>{pending ? "מוסיף…" : "הוספה"}</button>
      {error && <p className="form-error" role="alert">{error}</p>}
      {results && (
        <div className="bulk-results" role="status">
          <p>
            <strong>{counts.created}</strong> חשבונות חדשים · <strong>{counts.existing}</strong> כבר היו במערכת · <strong>{counts.invalid}</strong> שורות לא תקינות
          </p>
          {counts.created > 0 && (
            <a className="btn btn-quiet btn-sm" download="mozes-life-logins.csv" href={`data:text/csv;charset=utf-8,${encodeURIComponent(csv)}`}>הורדת פרטי הכניסה (CSV)</a>
          )}
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th scope="col">שורה</th><th scope="col">שם</th><th scope="col">אימייל</th><th scope="col">תוצאה</th><th scope="col">סיסמה זמנית</th></tr></thead>
              <tbody>
                {results.map((r) => (
                  <tr key={`${r.line}-${r.email}`}>
                    <td className="num">{r.line}</td>
                    <td>{r.name || "—"}</td>
                    <td dir="ltr">{r.email || r.raw}</td>
                    <td>{r.status === "created" ? <span className="chip chip-done">נוצר</span> : r.status === "existing" ? <span className="chip chip-neutral">קיים</span> : <span className="chip chip-fail">{r.email ? r.raw : "לא תקין"}</span>}</td>
                    <td dir="ltr" className="reveal-pass">{r.password ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {counts.created > 0 && <p className="muted">הסיסמאות מוצגות עכשיו בלבד. שמרו את הקובץ והעבירו לכל אחד את פרטי הכניסה שלו.</p>}
        </div>
      )}
    </form>
  );
}
