/* Automatic system seal — replaces hand signatures on system-generated documents.
   Brand ring text + the arches mark + issue date and report number. Pure SVG, prints crisply. */

export default function SystemSeal({ date, code, size = 150, lang = "ar" }: { date: string; code: string; size?: number; lang?: "ar" | "en" }) {
  const top = lang === "ar" ? "إدارة ميدان سيد الشهداء" : "SAYYID ALSHUHADA FIELD";
  const bottom = lang === "ar" ? "منصة تصاريح دخول الميدان" : "ENTRY PERMITS PLATFORM";
  const c = "#7a2f24";
  const font = "'IBM Plex Sans Arabic', sans-serif";
  return (
    <svg viewBox="0 0 200 200" width={size} height={size} role="img" aria-label={lang === "ar" ? "ختم النظام الآلي" : "Automatic system seal"} style={{ transform: "rotate(-7deg)" }}>
      <defs>
        {/* upper arc (left→right over the top) and lower arc (left→right under the bottom) */}
        <path id="seal-top" d="M 28 100 A 72 72 0 0 1 172 100" />
        <path id="seal-bot" d="M 34 108 A 66 66 0 0 0 166 108" />
      </defs>
      <g opacity=".9">
        <circle cx="100" cy="100" r="96" fill="none" stroke={c} strokeWidth="4.5" />
        <circle cx="100" cy="100" r="89" fill="none" stroke={c} strokeWidth="1.4" />
        <circle cx="100" cy="100" r="57" fill="none" stroke={c} strokeWidth="1.4" />
        <text fontSize="14" fontWeight="800" fill={c} fontFamily={font}>
          <textPath href="#seal-top" startOffset="50%" textAnchor="middle">{top}</textPath>
        </text>
        <text fontSize="12" fontWeight="700" fill={c} fontFamily={font}>
          <textPath href="#seal-bot" startOffset="50%" textAnchor="middle">{bottom}</textPath>
        </text>
        <text x="31" y="104" fontSize="10" fill={c} textAnchor="middle">✦</text>
        <text x="169" y="104" fontSize="10" fill={c} textAnchor="middle">✦</text>
        {/* arches mark */}
        <g transform="translate(78 60) scale(.46)" fill={c}>
          <path d="M4 64V22a14 14 0 0 1 28 0v42z" /><path d="M34 64V22a14 14 0 0 1 28 0v42z" /><path d="M64 64V22a14 14 0 0 1 28 0v42z" />
        </g>
        <text x="100" y="110" textAnchor="middle" fontSize="13.5" fontWeight="800" fill={c} fontFamily={font}>{lang === "ar" ? "صادر آليًا" : "SYSTEM ISSUED"}</text>
        <text x="100" y="125" textAnchor="middle" fontSize="10.5" fontWeight="700" fill={c} fontFamily={font} style={{ direction: "ltr" }}>{date}</text>
        <text x="100" y="138" textAnchor="middle" fontSize="8.5" fontWeight="700" fill={c} fontFamily={font} style={{ direction: "ltr" }}>{code}</text>
      </g>
    </svg>
  );
}
