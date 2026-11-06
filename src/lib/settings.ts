import "server-only";
import { q, q1 } from "./db";

export type StageRule = { type: "role" | "user"; value: string };
export type Settings = {
  field_name: { ar: string; en: string };
  issuer: { ar: string; en: string };
  stage1: StageRule;
  stage2: StageRule;
  separation_of_duties: boolean;
  rep_otp_mode: "off" | "optional" | "required";
  demo_mode: boolean;
  hmac_secret: string;
  signing_key: { public: JsonWebKey; private: string };
};

export async function getSetting<K extends keyof Settings>(key: K): Promise<Settings[K]> {
  const r = await q1<{ value: Settings[K] }>(`SELECT value FROM settings WHERE key=$1`, [key]);
  return r!.value;
}

export async function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  await q(`INSERT INTO settings(key,value) VALUES ($1,$2) ON CONFLICT (key) DO UPDATE SET value=EXCLUDED.value`, [
    key,
    JSON.stringify(value),
  ]);
}

export type Zone = { id: number; code: string; name_ar: string; name_en: string; sensitive: boolean; capacity_per_hour: number; active: boolean };
export type Gate = { id: number; name_ar: string; name_en: string; zone_ids: number[] };

export const listZones = (all = false) =>
  q<Zone>(`SELECT * FROM zones ${all ? "" : "WHERE active"} ORDER BY code`);
export const listGates = () => q<Gate>(`SELECT * FROM gates ORDER BY id`);
