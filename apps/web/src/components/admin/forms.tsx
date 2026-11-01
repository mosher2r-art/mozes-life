"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ROLE_LABELS_HE } from "@mozes/authz";

async function call(url: string, method: string, body?: unknown) {
  const res = await fetch(url, { method, headers: body ? { "content-type": "application/json" } : undefined, body: body ? JSON.stringify(body) : undefined });
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { ok: res.ok, data };
}

function Msg({ m }: { m: { tone: "ok" | "bad"; text: string } | null }) {
  if (!m) return null;
  return <p className={m.tone === "ok" ? "form-ok" : "form-error"} role={m.tone === "ok" ? "status" : "alert"}>{m.text}</p>;
}

/** Shows a one-time password with a copy button. */
export function PasswordReveal({ email, password }: { email: string; password: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="reveal" role="status">
      <p><strong>פרטי הכניסה נוצרו.</strong> העבירו אותם למשתמש. הסיסמה מוצגת עכשיו בלבד.</p>
      <dl className="reveal-kv">
        <dt>אימייל</dt><dd dir="ltr">{email}</dd>
        <dt>סיסמה</dt><dd dir="ltr" className="reveal-pass">{password}</dd>
      </dl>
      <button
        type="button"
        className="btn btn-quiet btn-sm"
        onClick={() => {
          navigator.clipboard.writeText(`${email}\n${password}`).then(() => setCopied(true), () => setCopied(false));
        }}
      >
        {copied ? "הועתק" : "העתקת פרטי הכניסה"}
      </button>
    </div>
  );
}

/**
 * Password reset: a random password, or one the administrator types. The result is shown once.
 * Used by system admins (Studio) and organization admins (their own members).
 */
export function PasswordReset({ endpoint, email, name, link = false }: { endpoint: string; email: string; name?: string; link?: boolean }) {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState<"random" | "manual">("random");
  const [value, setValue] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);
  const fid = endpoint.replace(/[^A-Za-z0-9]/g, "");

  if (!open) {
    return (
      <>
        <button type="button" className={link ? "ed-link" : "btn btn-quiet btn-sm"} aria-label={name ? `איפוס סיסמה ל${name}` : undefined} onClick={() => { setOpen(true); setDone(null); setError(null); }}>
          איפוס סיסמה
        </button>
        {done && <PasswordReveal email={email} password={done} />}
      </>
    );
  }
  return (
    <form
      className="pw-reset"
      onSubmit={async (e) => {
        e.preventDefault();
        setError(null);
        if (mode === "manual" && value.length < 10) return setError("הסיסמה צריכה להכיל לפחות 10 תווים.");
        setBusy(true);
        const r = await call(endpoint, "POST", mode === "manual" ? { password: value } : {});
        setBusy(false);
        if (r.ok) {
          setDone(String(r.data.password));
          setOpen(false);
          setValue("");
        } else setError(String(r.data.message ?? "איפוס הסיסמה נכשל."));
      }}
    >
      <fieldset className="radio-row">
        <legend>סיסמה חדשה{name ? ` ל${name}` : ""}</legend>
        <label><input type="radio" name={`${fid}-mode`} checked={mode === "random"} onChange={() => setMode("random")} /> אקראית</label>
        <label><input type="radio" name={`${fid}-mode`} checked={mode === "manual"} onChange={() => setMode("manual")} /> אקליד בעצמי</label>
      </fieldset>
      {mode === "manual" && (
        <div className="field">
          <label htmlFor={`${fid}-pw`}>הסיסמה (לפחות 10 תווים)</label>
          <div className="pw-input">
            <input id={`${fid}-pw`} type={show ? "text" : "password"} dir="ltr" autoComplete="new-password" value={value} onChange={(e) => setValue(e.target.value)} maxLength={128} />
            <button type="button" className="ed-link" onClick={() => setShow(!show)}>{show ? "הסתרה" : "הצגה"}</button>
          </div>
        </div>
      )}
      <p className="ef-hint">המשתמש ינותק מכל המכשירים ויצטרך להיכנס עם הסיסמה החדשה.</p>
      <div className="row-actions">
        <button type="submit" className="btn btn-primary btn-sm" disabled={busy}>{busy ? "שומר…" : "שמירת סיסמה"}</button>
        <button type="button" className="btn btn-quiet btn-sm" onClick={() => setOpen(false)}>ביטול</button>
      </div>
      {error && <p className="form-error" role="alert">{error}</p>}
    </form>
  );
}

const STAFF_ROLES = ["editor", "content_admin", "medical_reviewer", "super_admin"] as const;

export function NewUserForm({ orgs }: { orgs: { id: string; name: string }[] }) {
  const router = useRouter();
  const [form, setForm] = useState({ name: "", email: "", kind: "learner", orgId: orgs[0]?.id ?? "", password: "" });
  const [pending, setPending] = useState(false);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);
  const isLearner = form.kind === "learner" || form.kind === "org_admin";
  return (
    <form
      className="block form-grid"
      onSubmit={async (e) => {
        e.preventDefault();
        setPending(true);
        setMsg(null);
        setCreated(null);
        const pw = form.password ? { password: form.password } : {};
        const body = isLearner
          ? { name: form.name, email: form.email, roles: [], ...pw, ...(form.orgId ? { orgId: form.orgId, orgRole: form.kind } : {}) }
          : { name: form.name, email: form.email, roles: [form.kind], ...pw };
        const r = await call("/api/studio/users", "POST", body);
        setPending(false);
        if (r.ok) {
          setCreated({ email: form.email.trim().toLowerCase(), password: String(r.data.password) });
          setForm({ ...form, name: "", email: "", password: "" });
          router.refresh();
        } else setMsg({ tone: "bad", text: String(r.data.message ?? "יצירת המשתמש נכשלה.") });
      }}
    >
      <h2 className="form-title">משתמש חדש</h2>
      <div className="field"><label htmlFor="nu-name">שם מלא</label><input id="nu-name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required minLength={2} /></div>
      <div className="field"><label htmlFor="nu-email">אימייל</label><input id="nu-email" type="email" dir="ltr" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required /></div>
      <div className="field">
        <label htmlFor="nu-kind">תפקיד</label>
        <select id="nu-kind" value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
          <option value="learner">{ROLE_LABELS_HE.learner}</option>
          <option value="org_admin">{ROLE_LABELS_HE.org_admin}</option>
          {STAFF_ROLES.map((r) => <option key={r} value={r}>{ROLE_LABELS_HE[r]} (צוות MOZES)</option>)}
        </select>
      </div>
      {isLearner && (
        <div className="field">
          <label htmlFor="nu-org">ארגון</label>
          <select id="nu-org" value={form.orgId} onChange={(e) => setForm({ ...form, orgId: e.target.value })}>
            <option value="">ללא ארגון</option>
            {orgs.map((o) => <option key={o.id} value={o.id}>{o.name}</option>)}
          </select>
        </div>
      )}
      <div className="field">
        <label htmlFor="nu-pw">סיסמה (לא חובה)</label>
        <input id="nu-pw" type="text" dir="ltr" autoComplete="new-password" value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} minLength={10} maxLength={128} placeholder="ריק = סיסמה אקראית" />
      </div>
      <button className="btn btn-primary" type="submit" disabled={pending}>{pending ? "יוצר…" : "יצירת משתמש"}</button>
      <p className="muted form-wide">אם לא תקלידו סיסמה, תיווצר סיסמה אקראית (לפחות 10 תווים). שליחת הזמנות במייל תתווסף בהמשך.</p>
      <div className="form-wide"><Msg m={msg} />{created && <PasswordReveal {...created} />}</div>
    </form>
  );
}

export function UserActions({ id, email, roles, disabled, isSelf }: { id: string; email: string; roles: string[]; disabled: boolean; isSelf: boolean }) {
  const router = useRouter();
  const [sel, setSel] = useState<string[]>(roles);
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="stack-sm">
      <section className="block">
        <h2 className="form-title">הרשאות צוות</h2>
        <div className="checks">
          {STAFF_ROLES.map((r) => (
            <label key={r} className="ef-check">
              <input type="checkbox" checked={sel.includes(r)} onChange={(e) => setSel(e.target.checked ? [...sel, r] : sel.filter((x) => x !== r))} />
              {ROLE_LABELS_HE[r]}
            </label>
          ))}
        </div>
        <button type="button" className="btn btn-quiet btn-sm" onClick={async () => {
          const r = await call(`/api/studio/users/${id}/roles`, "PUT", { roles: sel });
          setMsg(r.ok ? { tone: "ok", text: "ההרשאות עודכנו." } : { tone: "bad", text: String(r.data.message ?? "העדכון נכשל.") });
          router.refresh();
        }}>שמירת הרשאות</button>
      </section>
      <section className="block">
        <h2 className="form-title">סיסמה וגישה</h2>
        <div className="row-actions">
          <PasswordReset endpoint={`/api/studio/users/${id}/password`} email={email} />
          {!isSelf && (confirm ? (
            <>
              <span className="muted">{disabled ? "להפעיל מחדש את החשבון?" : "להשבית את החשבון? המשתמש יתנתק מיד."}</span>
              <button type="button" className={disabled ? "btn btn-quiet btn-sm" : "btn btn-danger btn-sm"} onClick={async () => {
                const r = await call(`/api/studio/users/${id}/status`, "PUT", { disabled: !disabled });
                setConfirm(false);
                setMsg(r.ok ? { tone: "ok", text: disabled ? "החשבון הופעל." : "החשבון הושבת." } : { tone: "bad", text: String(r.data.message ?? "הפעולה נכשלה.") });
                router.refresh();
              }}>{disabled ? "הפעלה" : "השבתה"}</button>
              <button type="button" className="ed-link" onClick={() => setConfirm(false)}>ביטול</button>
            </>
          ) : (
            <button type="button" className="btn btn-quiet btn-sm" onClick={() => setConfirm(true)}>{disabled ? "הפעלת החשבון" : "השבתת החשבון"}</button>
          ))}
        </div>
      </section>
      <Msg m={msg} />
    </div>
  );
}

export function NewOrgForm() {
  const router = useRouter();
  const [name, setName] = useState("");
  const [type, setType] = useState("company");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  return (
    <form className="block form-grid" onSubmit={async (e) => {
      e.preventDefault();
      const r = await call("/api/studio/orgs", "POST", { name, type });
      if (r.ok) { setName(""); router.push(`/studio/orgs/${String(r.data.id)}`); }
      else setMsg({ tone: "bad", text: String(r.data.message ?? "יצירת הארגון נכשלה.") });
    }}>
      <h2 className="form-title">ארגון חדש</h2>
      <div className="field"><label htmlFor="no-name">שם הארגון</label><input id="no-name" value={name} onChange={(e) => setName(e.target.value)} required minLength={2} /></div>
      <div className="field">
        <label htmlFor="no-type">סוג</label>
        <select id="no-type" value={type} onChange={(e) => setType(e.target.value)}>
          <option value="company">חברה</option><option value="institution">מוסד</option><option value="building">בניין מגורים</option><option value="private">פרטי</option>
        </select>
      </div>
      <button className="btn btn-primary" type="submit">יצירת ארגון</button>
      <div className="form-wide"><Msg m={msg} /></div>
    </form>
  );
}

export function OrgMemberForm({ orgId }: { orgId: string }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("learner");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  return (
    <form className="block form-grid" onSubmit={async (e) => {
      e.preventDefault();
      const r = await call(`/api/studio/orgs/${orgId}/members`, "POST", { email, role });
      setMsg(r.ok ? { tone: "ok", text: "המשתמש נוסף לארגון." } : { tone: "bad", text: String(r.data.message ?? "ההוספה נכשלה.") });
      if (r.ok) { setEmail(""); router.refresh(); }
    }}>
      <h2 className="form-title">הוספת חבר יחיד או מנהל ארגון</h2>
      <div className="field"><label htmlFor="om-email">אימייל של משתמש קיים</label><input id="om-email" type="email" dir="ltr" value={email} onChange={(e) => setEmail(e.target.value)} required /></div>
      <div className="field">
        <label htmlFor="om-role">תפקיד בארגון</label>
        <select id="om-role" value={role} onChange={(e) => setRole(e.target.value)}><option value="learner">לומד/ת</option><option value="org_admin">מנהל/ת ארגון</option></select>
      </div>
      <button className="btn btn-primary" type="submit">הוספת חבר</button>
      <div className="form-wide"><Msg m={msg} /></div>
    </form>
  );
}

export function RemoveMemberButton({ orgId, userId, name }: { orgId: string; userId: string; name: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return confirm ? (
    <span className="row-actions">
      <button type="button" className="ed-link-danger" onClick={async () => { await call(`/api/studio/orgs/${orgId}/members/${userId}`, "DELETE"); router.refresh(); }}>הסרה</button>
      <button type="button" className="ed-link" onClick={() => setConfirm(false)}>ביטול</button>
    </span>
  ) : (
    <button type="button" className="ed-link" aria-label={`הסרת ${name} מהארגון`} onClick={() => setConfirm(true)}>הסרה מהארגון</button>
  );
}

export function SeatLimitForm({ orgId, limit, used }: { orgId: string; limit: number | null; used: number }) {
  const router = useRouter();
  const [value, setValue] = useState(limit ? String(limit) : "");
  const [msg, setMsg] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  return (
    <form className="block form-grid" onSubmit={async (e) => {
      e.preventDefault();
      const n = value.trim() === "" ? null : Number(value);
      if (n !== null && (!Number.isInteger(n) || n < 1)) return setMsg({ tone: "bad", text: "יש להזין מספר שלם וחיובי, או להשאיר ריק." });
      const r = await call(`/api/studio/orgs/${orgId}`, "PATCH", { seatLimit: n });
      setMsg(r.ok ? { tone: "ok", text: "המכסה עודכנה." } : { tone: "bad", text: "העדכון נכשל." });
      router.refresh();
    }}>
      <h2 className="form-title">מכסת משתמשים</h2>
      <div className="field">
        <label htmlFor="seat-limit">מספר משתמשים מרבי (ריק = ללא הגבלה)</label>
        <input id="seat-limit" type="number" min={1} inputMode="numeric" value={value} onChange={(e) => setValue(e.target.value)} />
      </div>
      <button className="btn btn-quiet" type="submit">שמירה</button>
      <p className="muted form-wide">בשימוש כרגע: {used}{limit ? ` מתוך ${limit}` : ""}.</p>
      <div className="form-wide"><Msg m={msg} /></div>
    </form>
  );
}
