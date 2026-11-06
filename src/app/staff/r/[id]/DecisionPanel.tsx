"use client";
import { useState } from "react";
import { decideAction } from "./actions";
import { btn, input } from "@/components/ui";

export default function DecisionPanel({ id, stage, lang }: { id: number; stage: 1 | 2; lang: "ar" | "en" }) {
  const t = (ar: string, en: string) => (lang === "ar" ? ar : en);
  const [mode, setMode] = useState<"approve" | "return" | "reject">("approve");
  const [reason, setReason] = useState("");
  const needReason = mode !== "approve";
  // Ready-made reasons: one tap fills a clear, applicant-friendly text that the reviewer can still edit.
  const presets: Record<"return" | "reject", [string, string][]> = {
    return: [
      ["أرفق خطاب التكليف أو العقد من الجهة.", "Attach the assignment letter or contract."],
      ["صحّح أرقام الهوية للأفراد الموضحة في الطلب.", "Correct the ID numbers of the listed people."],
      ["وضّح الغرض والموقع الدقيق للعمل داخل الميدان.", "Clarify the purpose and exact work location."],
      ["قلّص فترة الصلاحية لتطابق مدة العمل الفعلية.", "Shorten the validity to match the actual work period."],
    ],
    reject: [
      ["الغرض لا يستلزم دخول الميدان.", "The purpose does not require field entry."],
      ["تعارض مع فعالية مجدولة في المنطقة والفترة نفسيهما.", "Conflicts with a scheduled event in the same zone and period."],
      ["الجهة غير مخولة بالعمل في المنطقة الحساسة المطلوبة.", "The organization is not authorized for the requested sensitive zone."],
    ],
  };
  const opts = [
    ["approve", stage === 1 ? t("اعتماد أولي", "Approve stage 1") : t("اعتماد نهائي وإصدار", "Approve & issue")],
    ["return", t("إعادة للاستكمال", "Return")],
    ["reject", t("رفض", "Reject")],
  ] as const;
  return (
    <form action={decideAction} className="space-y-3">
      <input type="hidden" name="id" value={id} />
      <input type="hidden" name="decision" value={mode} />
      <div className="grid grid-cols-3 gap-1 rounded-xl bg-mist p-1" role="radiogroup">
        {opts.map(([k, l]) => (
          <button
            type="button"
            key={k}
            role="radio"
            aria-checked={mode === k}
            onClick={() => setMode(k)}
            className={`rounded-lg px-2 py-2 text-xs font-semibold transition ${mode === k ? (k === "reject" ? "bg-bad text-white" : k === "return" ? "bg-hold text-white" : "bg-brand text-white") : "text-ink-soft hover:text-ink"}`}
          >
            {l}
          </button>
        ))}
      </div>
      {mode !== "approve" && (
        <div className="flex flex-wrap gap-1.5" aria-label={t("أسباب جاهزة", "Ready reasons")}>
          {presets[mode].map(([ar, en]) => {
            const txt = t(ar, en);
            const on = reason.includes(txt);
            return (
              <button key={ar} type="button" aria-pressed={on}
                onClick={() => setReason(on ? reason.replace(txt, "").replace(/\s{2,}/g, " ").trim() : (reason.trim() ? reason.trim() + " " : "") + txt)}
                className={`min-h-9 rounded-full border px-3 text-start text-xs font-medium transition ${on ? (mode === "reject" ? "border-bad bg-bad-soft text-bad" : "border-hold bg-hold-soft text-hold") : "border-line bg-white text-ink hover:border-gold"}`}>
                {on ? "✓ " : "+ "}{txt}
              </button>
            );
          })}
        </div>
      )}
      <textarea
        name="reason"
        rows={3}
        required={needReason}
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className={input}
        placeholder={
          mode === "approve"
            ? t("ملاحظة (اختيارية)", "Note (optional)")
            : mode === "return"
              ? t("ما المطلوب استكماله؟ يظهر لمقدم الطلب", "What must be completed? Shown to the applicant")
              : t("سبب الرفض — يظهر لمقدم الطلب", "Rejection reason — shown to the applicant")
        }
      />
      {needReason && !reason.trim() && <p className="text-xs text-ink-soft">{t("السبب إلزامي ويظهر لمقدم الطلب — اختر سببًا جاهزًا أو اكتب سببك.", "A reason is required and shown to the applicant — pick one or write your own.")}</p>}
      <button className={`${mode === "reject" ? btn.danger : btn.primary} w-full`} disabled={needReason && !reason.trim()}>
        {t("تأكيد القرار", "Confirm decision")}
      </button>
      {stage === 2 && mode === "approve" && (
        <p className="text-xs text-ink-soft">{t("يصدر التصريح تلقائيًا برمز QR ويُشعر مقدم الطلب.", "The permit is issued automatically with a QR code and the applicant is notified.")}</p>
      )}
    </form>
  );
}
