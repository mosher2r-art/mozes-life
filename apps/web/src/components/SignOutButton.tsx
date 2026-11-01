"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

export function SignOutButton({ className = "icon-btn", label }: { className?: string; label?: string }) {
  const router = useRouter();
  const [pending, setPending] = useState(false);
  return (
    <button
      type="button"
      className={className}
      disabled={pending}
      aria-label={label ? undefined : "התנתקות"}
      title="התנתקות"
      onClick={async () => {
        setPending(true);
        await authClient.signOut();
        router.replace("/login");
        router.refresh();
      }}
    >
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M14 4h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-4M10 16l-4-4 4-4M6 12h10" />
      </svg>
      {label}
    </button>
  );
}
