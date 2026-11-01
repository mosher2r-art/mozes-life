"use client";

export function PrintButton() {
  return (
    <button type="button" className="btn btn-quiet cert-print" onClick={() => window.print()}>
      הדפסה או שמירה כ-PDF
    </button>
  );
}
