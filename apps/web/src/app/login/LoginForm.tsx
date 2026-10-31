"use client";

import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { authClient } from "@/lib/auth-client";

export function LoginForm() {
  const router = useRouter();
  const errId = useId();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError(null);
    const { error } = await authClient.signIn.email({
      email: String(form.get("email") ?? "").trim(),
      password: String(form.get("password") ?? ""),
    });
    if (error) {
      setPending(false);
      setError(
        error.status === 429
          ? "בוצעו יותר מדי ניסיונות. נסו שוב בעוד דקה."
          : "האימייל או הסיסמה שגויים.", // deliberately generic
      );
      return;
    }
    router.replace("/");
    router.refresh();
  }

  return (
    <form className="form" onSubmit={onSubmit} noValidate aria-describedby={error ? errId : undefined}>
      <div className="field">
        <label htmlFor="email">אימייל</label>
        <input id="email" name="email" type="email" dir="ltr" autoComplete="username" required />
      </div>
      <div className="field">
        <label htmlFor="password">סיסמה</label>
        <input id="password" name="password" type="password" dir="ltr" autoComplete="current-password" required />
      </div>
      {error && (
        <p id={errId} role="alert" className="form-error">
          {error}
        </p>
      )}
      <button className="btn btn-primary" type="submit" disabled={pending} aria-busy={pending}>
        {pending ? "מתחברים…" : "התחברות"}
      </button>
    </form>
  );
}
