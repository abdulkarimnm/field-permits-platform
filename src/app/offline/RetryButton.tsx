"use client";

export default function RetryButton() {
  return (
    <button onClick={() => location.reload()} className="min-h-12 rounded-xl bg-gradient-to-b from-gold-soft to-gold px-5 text-sm font-bold text-noir">
      إعادة المحاولة
    </button>
  );
}
