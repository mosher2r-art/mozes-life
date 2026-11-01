"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { PasswordReset } from "@/components/admin/forms";

export function OrgMemberActions({ orgId, userId, name, email }: { orgId: string; userId: string; name: string; email: string }) {
  const router = useRouter();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="row-actions">
      <PasswordReset endpoint={`/api/org/${orgId}/members/${userId}/password`} email={email} name={name} link />
      {confirm ? (
        <>
          <button type="button" className="ed-link-danger" onClick={async () => { await fetch(`/api/org/${orgId}/members/${userId}`, { method: "DELETE" }); router.refresh(); }}>הסרה</button>
          <button type="button" className="ed-link" onClick={() => setConfirm(false)}>ביטול</button>
        </>
      ) : (
        <button type="button" className="ed-link" aria-label={`הסרת ${name} מהארגון`} onClick={() => setConfirm(true)}>הסרה</button>
      )}

    </div>
  );
}
