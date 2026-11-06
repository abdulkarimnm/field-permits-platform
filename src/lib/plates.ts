// Shared between browser and server.
/* Saudi private plate: 1–4 digits + 1–3 letters from the 17 approved letters.
   Each Arabic letter has a fixed Latin twin printed under it on the plate. */

export const PLATE_LETTERS: [string, string][] = [
  ["ا", "A"], ["ب", "B"], ["ح", "J"], ["د", "D"], ["ر", "R"], ["س", "S"], ["ص", "X"], ["ط", "T"], ["ع", "E"],
  ["ق", "G"], ["ك", "K"], ["ل", "L"], ["م", "Z"], ["ن", "N"], ["ه", "H"], ["و", "U"], ["ى", "V"],
];
const AR2EN = new Map(PLATE_LETTERS);
const EN2AR = new Map(PLATE_LETTERS.map(([a, e]) => [e, a]));
/** Common look-alikes people type → the official letter. */
const ALIAS: Record<string, string> = { "أ": "ا", "إ": "ا", "آ": "ا", "ي": "ى", "ئ": "ى", "ة": "ه", "هـ": "ه", "ـ": "" };

export type SaPlate = { letters: string[]; digits: string };

/** Normalise free typing (Arabic or Latin, any spacing) into official Arabic letters. Unknown letters are dropped. */
export function cleanLetters(raw: string): string[] {
  const out: string[] = [];
  for (const ch of raw.toUpperCase()) {
    const c = ALIAS[ch] ?? ch;
    if (!c) continue;
    if (AR2EN.has(c)) out.push(c);
    else if (EN2AR.has(c)) out.push(EN2AR.get(c)!);
  }
  return out.slice(0, 3);
}
export const cleanDigits = (raw: string) => raw.replace(/[٠-٩]/g, (d) => String("٠١٢٣٤٥٦٧٨٩".indexOf(d))).replace(/\D/g, "").slice(0, 4);
export const latinOf = (letters: string[]) => letters.map((l) => AR2EN.get(l) ?? "?");
export const arabicDigits = (d: string) => d.replace(/\d/g, (x) => "٠١٢٣٤٥٦٧٨٩"[Number(x)]);

/** Canonical stored text: "ر ك ن 1502" (letters right-to-left as read in Arabic, then digits). */
export const formatSaPlate = (p: SaPlate) => `${p.letters.join(" ")} ${p.digits}`.trim();

/** Parse a stored plate string back into parts; null if it isn't a Saudi-format plate. */
export function parseSaPlate(plate: string): SaPlate | null {
  const s = plate.trim();
  const m = s.match(/^([؀-ۿA-Za-z\s]+?)\s*(\d{1,4})$/) || s.match(/^(\d{1,4})\s*([؀-ۿA-Za-z\s]+)$/);
  if (!m) return null;
  const [lettersRaw, digits] = /^\d/.test(m[1]) ? [m[2], m[1]] : [m[1], m[2]];
  const letters = cleanLetters(lettersRaw);
  const typed = lettersRaw.replace(/\s/g, "").length;
  if (!letters.length || letters.length !== Math.min(3, typed)) return null;
  return { letters, digits };
}

export const isValidSaPlate = (p: SaPlate) => p.letters.length >= 1 && p.letters.length <= 3 && /^\d{1,4}$/.test(p.digits);

export const EQUIPMENT_KINDS: { id: string; ar: string; en: string }[] = [
  { id: "tools", ar: "أدوات يدوية", en: "Hand tools" },
  { id: "power", ar: "معدات كهربائية", en: "Power equipment" },
  { id: "lift", ar: "رفع وتحميل", en: "Lifting" },
  { id: "av", ar: "صوت وإضاءة", en: "Sound & lighting" },
  { id: "build", ar: "إنشاءات وسقالات", en: "Construction" },
  { id: "other", ar: "أخرى", en: "Other" },
];
