import { appIcon } from "@/lib/appIcon";

const SIZES: Record<string, { size: number; maskable?: boolean }> = {
  "icon-192.png": { size: 192 },
  "icon-512.png": { size: 512 },
  "maskable-512.png": { size: 512, maskable: true },
  "apple-180.png": { size: 180, maskable: true },
};

export async function GET(_: Request, { params }: { params: Promise<{ name: string }> }) {
  const { name } = await params;
  const s = SIZES[name];
  if (!s) return new Response("Not found", { status: 404 });
  const res = appIcon(s.size, { maskable: s.maskable });
  res.headers.set("Cache-Control", "public, max-age=604800, immutable");
  return res;
}
