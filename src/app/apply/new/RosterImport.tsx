"use client";
import { useRef, useState } from "react";
import { btn, input } from "@/components/ui";
import { Icon } from "@/components/icons";
import { useOverlay } from "@/components/useOverlay";
import { formatSaPlate, parseSaPlate } from "@/lib/plates";
import type { Person, Vehicle } from "@/lib/validate";
import { readRosterFile } from "./roster";

type Kind = "people" | "vehicles";
type T = (ar: string, en: string) => string;

const ID_RE = /^[12]\d{9}$/;
const toLatin = (s: string) => s.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/[۰-۹]/g, (d) => String("۰۱۲۳۴۵۶۷۸۹".indexOf(d)));
const digits = (s: string) => toLatin(s).replace(/\D/g, "");

export function parseText(text: string): string[][] {
  return text
    .split(/\r?\n/)
    .map((l) => l.split(/\t|,|؛|;/).map((c) => c.trim()))
    .filter((r) => r.some(Boolean));
}

const HEAD = {
  name: /^(الاسم|اسم|الاسم الكامل|اسم الفرد|name|full ?name)$/i,
  id: /(هوية|الهوية|إقامة|اقامة|السجل|id|iqama|national)/i,
  plate: /(لوحة|اللوحة|plate)/i,
  type: /(نوع|النوع|الطراز|type|model)/i,
};

/** Works out which column is which (header names first, then content), and drops header rows. */
function mapPeople(rows: string[][]): Person[] {
  let nameCol = -1, idCol = -1, start = 0;
  for (let r = 0; r < Math.min(3, rows.length); r++) {
    const n = rows[r].findIndex((c) => HEAD.name.test(c.trim()));
    const i = rows[r].findIndex((c) => HEAD.id.test(c.trim()) && !/^\d+$/.test(digits(c) || "x"));
    if (n >= 0 || i >= 0) { nameCol = n; idCol = i; start = r + 1; break; }
  }
  const width = Math.max(...rows.map((r) => r.length), 0);
  if (idCol < 0) {
    // the column where most cells are 10-digit numbers
    let best = -1, score = 0;
    for (let c = 0; c < width; c++) {
      const s = rows.slice(start).filter((r) => /^\d{10}$/.test(digits(r[c] ?? ""))).length;
      if (s > score) { score = s; best = c; }
    }
    idCol = best >= 0 ? best : 1;
  }
  if (nameCol < 0) {
    let best = -1, score = 0;
    for (let c = 0; c < width; c++) {
      if (c === idCol) continue;
      const s = rows.slice(start).filter((r) => /\p{L}{2,}/u.test(r[c] ?? "")).length;
      if (s > score) { score = s; best = c; }
    }
    nameCol = best >= 0 ? best : idCol === 0 ? 1 : 0;
  }
  return rows.slice(start).map((r) => ({ name: (r[nameCol] ?? "").replace(/\s+/g, " ").trim().slice(0, 120), id_number: digits(r[idCol] ?? "").slice(0, 10) })).filter((p) => p.name || p.id_number);
}

function mapVehicles(rows: string[][]): Vehicle[] {
  let plateCol = 0, typeCol = 1, start = 0;
  for (let r = 0; r < Math.min(3, rows.length); r++) {
    const p = rows[r].findIndex((c) => HEAD.plate.test(c.trim()));
    if (p >= 0) {
      plateCol = p;
      const ty = rows[r].findIndex((c, i) => i !== p && HEAD.type.test(c.trim()));
      typeCol = ty >= 0 ? ty : p === 0 ? 1 : 0;
      start = r + 1;
      break;
    }
  }
  return rows
    .slice(start)
    .map((r) => {
      const a = toLatin(r[plateCol] ?? "").trim();
      const b = (r[typeCol] ?? "").trim().slice(0, 60);
      const sp = parseSaPlate(a);
      return sp ? { plate: formatSaPlate(sp), type: b, kind: "sa" as const } : { plate: a.toUpperCase().slice(0, 20), type: b, kind: "other" as const };
    })
    .filter((v) => v.plate || v.type);
}

export default function RosterImport({ kind, room, onAdd, onClose, t }: { kind: Kind; room: number; onAdd: (rows: Person[] | Vehicle[]) => void; onClose: () => void; t: T }) {
  useOverlay(true, onClose);
  const [mode, setMode] = useState<"file" | "paste">("file");
  const [rows, setRows] = useState<string[][]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [drag, setDrag] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const src = mode === "paste" ? parseText(text) : rows;
  const items = kind === "people" ? mapPeople(src) : mapVehicles(src);
  const okOf = (x: Person | Vehicle) => ("id_number" in x ? !!x.name && ID_RE.test(x.id_number) : x.plate.replace(/\s/g, "").length >= 4);
  const bad = items.filter((x) => !okOf(x)).length;
  const take = Math.min(items.length, room);

  async function pick(f: File | undefined) {
    if (!f) return;
    setErr(null);
    setBusy(true);
    setFileName(f.name);
    try {
      const fd = new FormData();
      fd.set("file", f);
      const r = await readRosterFile(fd);
      if (r.ok) setRows(r.rows);
      else { setRows([]); setErr(t(r.ar, r.en)); }
    } catch {
      setErr(t("تعذّر رفع الملف، حاول مرة ثانية", "Upload failed, try again"));
    } finally {
      setBusy(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const title = kind === "people" ? t("استيراد قائمة الأفراد", "Import people list") : t("استيراد قائمة المركبات", "Import vehicle list");
  const cols = kind === "people" ? [t("الاسم", "Name"), t("رقم الهوية", "ID number")] : [t("رقم اللوحة", "Plate"), t("النوع", "Type")];

  return (
    <div className="fixed inset-0 z-[90] grid place-items-end bg-ink/45 sm:place-items-center sm:p-4" role="dialog" aria-modal="true" aria-labelledby="ri-h" onClick={onClose}>
      <div className="flex max-h-[92dvh] w-full max-w-xl flex-col overflow-hidden rounded-t-3xl bg-surface shadow-2xl sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
        <div className="border-b border-line px-5 pb-3 pt-4">
          <div className="mx-auto mb-3 h-1.5 w-10 rounded-full bg-line sm:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 id="ri-h" className="font-sans text-lg font-bold text-ink">{title}</h3>
              <p className="mt-0.5 text-xs text-ink-soft">{kind === "people" ? t("عمودين: الاسم ورقم الهوية، بأي ترتيب. نتعرف على الأعمدة تلقائيًا.", "Two columns: name and ID, any order. Columns are detected automatically.") : t("عمودين: رقم اللوحة ثم النوع.", "Two columns: plate, then type.")}</p>
            </div>
            <button type="button" onClick={onClose} className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-ink-soft hover:bg-mist" aria-label={t("إغلاق", "Close")}>✕</button>
          </div>
          <div className="mt-3 grid grid-cols-2 gap-1 rounded-xl bg-mist p-1" role="tablist">
            {([["file", t("رفع ملف Excel", "Upload Excel file")], ["paste", t("نسخ ولصق", "Copy & paste")]] as const).map(([k, l]) => (
              <button key={k} type="button" role="tab" aria-selected={mode === k} onClick={() => { setMode(k); setErr(null); }}
                className={`min-h-10 rounded-lg text-sm font-semibold transition ${mode === k ? "bg-surface text-brand shadow-sm" : "text-ink-soft hover:text-ink"}`}>{l}</button>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {mode === "file" ? (
            <>
              <label
                onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
                onDragLeave={() => setDrag(false)}
                onDrop={(e) => { e.preventDefault(); setDrag(false); pick(e.dataTransfer.files?.[0]); }}
                className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed px-4 py-7 text-center transition ${drag ? "border-brand bg-chip" : "border-line hover:border-gold hover:bg-chip/50"}`}
              >
                <span className="grid h-12 w-12 place-items-center rounded-2xl bg-chip text-brand"><Icon name={busy ? "log" : "upload"} size={24} className={busy ? "animate-spin" : ""} /></span>
                <span className="text-sm font-semibold text-ink">{busy ? t("جارٍ قراءة الملف…", "Reading the file…") : fileName ?? t("اضغط لاختيار الملف أو اسحبه هنا", "Tap to choose a file or drop it here")}</span>
                <span className="text-xs text-ink-soft">xlsx · csv — {t("حتى 2MB", "up to 2MB")}</span>
                <input ref={fileRef} type="file" className="sr-only" accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv" onChange={(e) => pick(e.target.files?.[0])} />
              </label>
              <a href={`/api/roster/template?kind=${kind}`} className="mt-3 inline-flex min-h-10 items-center gap-1.5 rounded-lg px-2 text-sm font-semibold text-brand hover:bg-chip" download>
                <Icon name="download" size={16} /> {t("تحميل نموذج Excel جاهز", "Download a ready Excel template")}
              </a>
            </>
          ) : (
            <>
              <textarea autoFocus rows={7} dir="auto" className={`${input} font-mono text-sm`} value={text} onChange={(e) => setText(e.target.value)}
                placeholder={kind === "people" ? t("خالد عبدالله	1012345678", "Khalid	1012345678") : "1234 ا ب ح	ونيت"} aria-label={t("الصق القائمة هنا", "Paste the list here")} />
              <p className="mt-1 text-xs text-ink-soft">{t("انسخ الأعمدة من Excel والصقها هنا (سطر لكل عنصر).", "Copy the columns from Excel and paste here (one per line).")}</p>
            </>
          )}

          {err && <p role="alert" className="mt-3 rounded-xl bg-bad-soft px-3 py-2 text-sm text-bad">{err}</p>}

          {items.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                <span className="font-semibold text-ink"><span className="num">{items.length}</span> {kind === "people" ? t("فرد", "people") : t("مركبة", "vehicles")}</span>
                {bad ? <span className="text-hold">· <span className="num">{bad}</span> {t("تحتاج تصحيح بعد الإضافة", "need fixing after adding")}</span> : <span className="text-ok">· {t("كلها سليمة", "all valid")} ✓</span>}
                {items.length > room && <span className="text-bad">· {t(`يتسع النموذج لـ ${room} فقط`, `Only ${room} fit`)}</span>}
              </div>
              <div className="overflow-hidden rounded-xl border border-line">
                <table className="w-full text-sm">
                  <thead className="bg-mist text-xs text-ink-soft">
                    <tr><th className="w-8 px-2 py-2 text-center">#</th>{cols.map((c) => <th key={c} className="px-3 py-2 text-start font-medium">{c}</th>)}<th className="w-8" /></tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {items.slice(0, 50).map((x, i) => {
                      const ok = okOf(x);
                      const [a, b] = "id_number" in x ? [x.name, x.id_number] : [x.plate, x.type];
                      return (
                        <tr key={i} className={ok ? "" : "bg-hold-soft/50"}>
                          <td className="num px-2 py-1.5 text-center text-xs text-ink-soft">{i + 1}</td>
                          <td className="max-w-0 truncate px-3 py-1.5 text-ink">{a || <span className="text-bad">—</span>}</td>
                          <td className="num px-3 py-1.5 text-ink">{b || <span className="text-ink-soft">—</span>}</td>
                          <td className="px-2 text-center">{ok ? <span className="text-ok">✓</span> : <span className="text-hold" title={t("تحتاج تصحيح", "Needs fixing")}>!</span>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                {items.length > 50 && <p className="num border-t border-line px-3 py-1.5 text-xs text-ink-soft">+{items.length - 50}</p>}
              </div>
            </div>
          )}
        </div>

        <div className="flex gap-2 border-t border-line bg-surface px-5 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3">
          <button type="button" className={`${btn.secondary} flex-1`} onClick={onClose}>{t("إلغاء", "Cancel")}</button>
          <button type="button" className={`${btn.primary} flex-[2]`} disabled={!take || busy} onClick={() => onAdd(items.slice(0, room) as Person[] | Vehicle[])}>
            {take ? t(`إضافة ${take} للقائمة`, `Add ${take} to the list`) : t("إضافة", "Add")}
          </button>
        </div>
      </div>
    </div>
  );
}
