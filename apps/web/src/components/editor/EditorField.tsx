"use client";
import { useId } from "react";
export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => React.ReactNode }) {
  const id = useId();
  return (
    <div className="ef">
      <label htmlFor={id}>{label}</label>
      {children(id)}
      {hint && <p className="ef-hint">{hint}</p>}
    </div>
  );
}

