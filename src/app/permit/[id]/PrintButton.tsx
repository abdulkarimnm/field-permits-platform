"use client";

export default function PrintButton() {
  return (
    <div className="flex items-center gap-3">
      <span className="hidden text-xs text-ink-soft sm:inline">اختر «حفظ بتنسيق PDF» من نافذة الطباعة · Choose “Save as PDF”</span>
      <button
        onClick={() => window.print()}
        className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-brand px-4 py-2 text-sm font-semibold text-white hover:bg-brand-deep"
      >
        تنزيل PDF / طباعة
      </button>
    </div>
  );
}

export function BackButton() {
  return (
    <button onClick={() => history.back()} className="text-sm text-ink-soft hover:text-brand">
      ← رجوع / Back
    </button>
  );
}
