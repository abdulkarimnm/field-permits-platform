import { createHash, createHmac, randomBytes, randomInt, scrypt, timingSafeEqual } from "node:crypto";

export const randomToken = (bytes = 32) => randomBytes(bytes).toString("base64url"); // 32 bytes = 256 bit
export const sha256 = (s: string) => createHash("sha256").update(s).digest("hex");
export const hmac = (secret: string, s: string) => createHmac("sha256", secret).update(s).digest("hex");
export const otpCode = (len = 6) => Array.from({ length: len }, () => randomInt(0, 10)).join("");

export function safeEqual(a: string, b: string) {
  const A = Buffer.from(a);
  const B = Buffer.from(b);
  return A.length === B.length && timingSafeEqual(A, B);
}

export function hashPassword(pw: string): Promise<string> {
  const salt = randomBytes(16);
  return new Promise((res, rej) =>
    scrypt(pw, salt, 64, { N: 16384, r: 8, p: 1 }, (e, key) =>
      e ? rej(e) : res(`scrypt$${salt.toString("hex")}$${key.toString("hex")}`),
    ),
  );
}

export function verifyPassword(pw: string, stored: string): Promise<boolean> {
  const [, saltHex, keyHex] = stored.split("$");
  if (!saltHex || !keyHex) return Promise.resolve(false);
  return new Promise((res) =>
    scrypt(pw, Buffer.from(saltHex, "hex"), 64, { N: 16384, r: 8, p: 1 }, (e, key) =>
      res(!e && timingSafeEqual(key, Buffer.from(keyHex, "hex"))),
    ),
  );
}

/** Rotating code shown in the representative's phone: changes every 30 s. */
export const ROT_WINDOW = 30;
export function rotatingCode(secret: string, permitNumber: string, window: number) {
  return hmac(secret, `${permitNumber}:${window}`).slice(0, 12);
}
