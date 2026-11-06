import "server-only";
import path from "node:path";
import fs from "node:fs/promises";
import { q } from "./db";
import { randomToken } from "./crypto";

/** Attachments live outside /public, under random names, and are only served through an authorized, logged route. */
export const STORAGE_DIR = path.join(process.cwd(), "storage");
export const MAX_FILE = 5 * 1024 * 1024;

function sniff(buf: Buffer): { mime: string; ext: string } | null {
  if (buf.subarray(0, 5).toString("latin1") === "%PDF-") return { mime: "application/pdf", ext: "pdf" };
  if (buf[0] === 0x89 && buf.subarray(1, 4).toString("latin1") === "PNG") return { mime: "image/png", ext: "png" };
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return { mime: "image/jpeg", ext: "jpg" };
  return null;
}

export async function saveAttachments(requestId: number, files: { file: File; label: string }[]) {
  const errors: string[] = [];
  await fs.mkdir(STORAGE_DIR, { recursive: true });
  for (const { file, label } of files.slice(0, 10)) {
    if (!file.size) continue;
    if (file.size > MAX_FILE) {
      errors.push(`${file.name}: > 5MB`);
      continue;
    }
    const buf = Buffer.from(await file.arrayBuffer());
    const type = sniff(buf); // real type from content, not the extension
    if (!type) {
      errors.push(`${file.name}: type`);
      continue;
    }
    const stored = `${randomToken(18)}.${type.ext}`;
    await fs.writeFile(path.join(STORAGE_DIR, stored), buf, { flag: "wx" });
    await q(`INSERT INTO attachments(request_id,stored_name,original_name,mime,size,label) VALUES ($1,$2,$3,$4,$5,$6)`, [
      requestId,
      stored,
      file.name.slice(0, 120),
      type.mime,
      file.size,
      label.slice(0, 80) || null,
    ]);
  }
  return errors;
}
