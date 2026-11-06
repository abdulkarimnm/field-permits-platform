import { NextResponse, type NextRequest } from "next/server";
import { sameOrigin } from "@/lib/access";
import { logError } from "@/lib/errors";

/* Browser error intake. Same-origin only, small payloads, simple per-IP rate limit. */
const hits = new Map<string, { n: number; t: number }>();

export async function POST(req: NextRequest) {
  if (!(await sameOrigin())) return NextResponse.json({ ok: false }, { status: 403 });
  const ip = req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
  const now = Date.now();
  const h = hits.get(ip);
  if (h && now - h.t < 60_000) { if (++h.n > 20) return NextResponse.json({ ok: false }, { status: 429 }); }
  else hits.set(ip, { n: 1, t: now });
  const raw = await req.text();
  if (raw.length > 12_000) return NextResponse.json({ ok: false }, { status: 413 });
  let b: Record<string, unknown> = {};
  try { b = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const s = (v: unknown) => (typeof v === "string" ? v : null);
  await logError({
    source: b.kind === "render" ? "render" : "client",
    level: b.level === "warning" ? "warning" : "error",
    message: s(b.message) ?? "Unknown client error",
    stack: s(b.stack),
    path: s(b.path),
    digest: s(b.digest),
    userAgent: req.headers.get("user-agent"),
  });
  return NextResponse.json({ ok: true });
}
