"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordReveal } from "@/components/admin/forms";

export function OrgMemberActions({ orgId, userId, name, email }: { orgId: string; userId: string; name: string; email: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  const [password, setPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  return (
    <div className="row-actions">
      <button type="button" className="ed-link" onClick={async () => {
        setError(null);
        const res = await fetch(`/api/org/${orgId}/members/${userId}/password`, { method: "POST" });
        const body = (await res.json().catch(() => ({}))) as { password?: string; message?: string };
        if (res.ok && body.password) setPassword(body.password);
        else setError(body.message ?? "האיפוס נכשל.");
      }}>איפוס סיסמה</button>
      {confirm ? (
        <>
          <button type="button" className="ed-link-danger" onClick={async () => { await fetch(`/api/org/${orgId}/members/${userId}`, { method: "DELETE" }); router.refresh(); }}>הסרה</button>
          <button type="button" className="ed-link" onClick={() => setConfirm(false)}>ביטול</button>
        </>
      ) : (
        <button type="button" className="ed-link" aria-label={`הסרת ${name} מהארגון`} onClick={() => setConfirm(true)}>הסרה</button>
      )}
      {password && <PasswordReveal email={email} password={password} />}
      {error && <p className="form-error" role="alert">{error}</p>}
    </div>
  );
}
