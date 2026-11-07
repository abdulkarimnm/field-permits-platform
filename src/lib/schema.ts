import type { Driver } from "./db";
import { hashPassword } from "./crypto";
import { generateKeyPairSync, randomBytes } from "node:crypto";

const DDL = `
CREATE TABLE IF NOT EXISTS settings (key text PRIMARY KEY, value jsonb NOT NULL);

CREATE TABLE IF NOT EXISTS users (
  id serial PRIMARY KEY,
  username text UNIQUE NOT NULL,
  name text NOT NULL,
  password_hash text NOT NULL,
  roles text[] NOT NULL DEFAULT '{}',
  agency text,
  active boolean NOT NULL DEFAULT true,
  failed_attempts int NOT NULL DEFAULT 0,
  locked_until timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sessions (
  token_hash text PRIMARY KEY,
  kind text NOT NULL,
  user_id int,
  contact text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  idle_minutes int
);

CREATE TABLE IF NOT EXISTS otps (
  id serial PRIMARY KEY,
  purpose text NOT NULL,
  target text NOT NULL,
  code_hmac text NOT NULL,
  expires_at timestamptz NOT NULL,
  attempts int NOT NULL DEFAULT 0,
  consumed boolean NOT NULL DEFAULT false,
  meta jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS otps_target ON otps(target, purpose, created_at);

CREATE TABLE IF NOT EXISTS outbox (
  id serial PRIMARY KEY,
  channel text NOT NULL,
  target text NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS orgs (
  contact text PRIMARY KEY,
  name text, cr_number text, rep_name text, rep_phone text, rep_id text,
  people jsonb NOT NULL DEFAULT '[]', vehicles jsonb NOT NULL DEFAULT '[]', equipment jsonb NOT NULL DEFAULT '[]',
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS zones (
  id serial PRIMARY KEY,
  code text UNIQUE NOT NULL,
  name_ar text NOT NULL, name_en text NOT NULL,
  sensitive boolean NOT NULL DEFAULT false,
  capacity_per_hour int NOT NULL DEFAULT 20,
  active boolean NOT NULL DEFAULT true
);

CREATE TABLE IF NOT EXISTS gates (
  id serial PRIMARY KEY,
  name_ar text NOT NULL, name_en text NOT NULL,
  zone_ids int[] NOT NULL DEFAULT '{}'
);

CREATE TABLE IF NOT EXISTS requests (
  id serial PRIMARY KEY,
  ref text UNIQUE NOT NULL,
  kind text NOT NULL DEFAULT 'new',
  permit_id int,
  contact text NOT NULL,
  org_name text NOT NULL, cr_number text, rep_name text NOT NULL, rep_phone text NOT NULL, rep_id text NOT NULL,
  purpose text NOT NULL,
  valid_from timestamptz NOT NULL, valid_to timestamptz NOT NULL,
  zones int[] NOT NULL,
  slot_date text, slot_hour int, -- YYYY-MM-DD
  people jsonb NOT NULL DEFAULT '[]', vehicles jsonb NOT NULL DEFAULT '[]', equipment jsonb NOT NULL DEFAULT '[]',
  declaration boolean NOT NULL DEFAULT false,
  status text NOT NULL,
  stage1_by int, stage1_at timestamptz, stage1_note text,
  stage2_by int, stage2_at timestamptz,
  reason text,
  risk_score int NOT NULL DEFAULT 0, risk_flags jsonb NOT NULL DEFAULT '[]', lane text NOT NULL DEFAULT 'normal',
  submitted_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS requests_contact ON requests(contact);
CREATE INDEX IF NOT EXISTS requests_status ON requests(status);

CREATE TABLE IF NOT EXISTS request_events (
  id serial PRIMARY KEY,
  request_id int NOT NULL,
  at timestamptz NOT NULL DEFAULT now(),
  actor text NOT NULL,
  action text NOT NULL,
  note text
);

CREATE TABLE IF NOT EXISTS attachments (
  id serial PRIMARY KEY,
  request_id int NOT NULL,
  stored_name text NOT NULL,
  original_name text NOT NULL,
  mime text NOT NULL,
  size int NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS permits (
  id serial PRIMARY KEY,
  number text UNIQUE NOT NULL,
  request_id int NOT NULL,
  token text UNIQUE NOT NULL,
  rot_secret text NOT NULL,
  version int NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'active',
  status_reason text,
  contact text NOT NULL,
  org_name text NOT NULL,
  rep_phone text NOT NULL,
  valid_from timestamptz NOT NULL, valid_to timestamptz NOT NULL,
  zones int[] NOT NULL,
  data jsonb NOT NULL,
  issued_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS checks (
  id serial PRIMARY KEY,
  permit_id int,
  code_type text NOT NULL,
  verifier_id int,
  agency text,
  gate_id int,
  at timestamptz NOT NULL DEFAULT now(),
  status_at_check text NOT NULL,
  version int,
  decision text,
  deny_reason text,
  matched jsonb,
  rep_otp text,
  offline boolean NOT NULL DEFAULT false,
  client_id text UNIQUE
);
CREATE INDEX IF NOT EXISTS checks_at ON checks(at);
-- direction: 'in' = entry check, 'out' = exit (one scan exits everyone still inside under that permit)
ALTER TABLE checks ADD COLUMN IF NOT EXISTS direction text NOT NULL DEFAULT 'in';
ALTER TABLE orgs ADD COLUMN IF NOT EXISTS teams jsonb NOT NULL DEFAULT '[]';
CREATE INDEX IF NOT EXISTS checks_permit ON checks(permit_id);

CREATE TABLE IF NOT EXISTS audit (
  id serial PRIMARY KEY,
  at text NOT NULL,
  actor text NOT NULL,
  action text NOT NULL,
  entity text,
  entity_id text,
  data jsonb,
  prev_hash text NOT NULL,
  hash text NOT NULL
);

-- technical error log: repeated errors are grouped by fingerprint (count + last_at)
CREATE TABLE IF NOT EXISTS error_log (
  id serial PRIMARY KEY,
  fingerprint text UNIQUE NOT NULL,
  level text NOT NULL DEFAULT 'error',
  source text NOT NULL,
  message text NOT NULL,
  stack text,
  path text,
  method text,
  digest text,
  user_agent text,
  actor text,
  count int NOT NULL DEFAULT 1,
  first_at timestamptz NOT NULL DEFAULT now(),
  last_at timestamptz NOT NULL DEFAULT now(),
  resolved boolean NOT NULL DEFAULT false,
  resolved_by text,
  resolved_at timestamptz
);
CREATE INDEX IF NOT EXISTS error_log_last ON error_log(last_at);
`;

export const DEMO_PASSWORD = "Demo@2026"; // documented in README – change before real use

/** Roles added after a site was first seeded get their demo account once (idempotent). */
async function ensureRoleAccounts(d: Driver) {
  const has = await d.query(`SELECT 1 FROM users WHERE 'opsmanager' = ANY(roles) LIMIT 1`);
  if (has.length) return;
  const taken = await d.query(`SELECT 1 FROM users WHERE username='opsmanager'`);
  if (taken.length) return;
  await d.query(`INSERT INTO users(username,name,password_hash,roles,agency) VALUES ($1,$2,$3,$4,$5)`, ["opsmanager", "مدير التشغيل", await hashPassword(DEMO_PASSWORD), ["opsmanager"], null]);
}

export async function migrate(d: Driver) {
  await d.exec(DDL);
  const seeded = await d.query(`SELECT 1 FROM settings WHERE key='seeded'`);
  if (seeded.length) return ensureRoleAccounts(d);

  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const settings: Record<string, unknown> = {
    field_name: { ar: "ميدان سيد الشهداء", en: "Sayyid Alshuhada Field" },
    issuer: { ar: "إدارة الميدان", en: "Field Administration" },
    stage1: { type: "role", value: "reviewer" },
    stage2: { type: "role", value: "approver" },
    separation_of_duties: true,
    rep_otp_mode: "optional",
    demo_mode: true,
    hmac_secret: randomBytes(32).toString("hex"),
    signing_key: {
      public: publicKey.export({ format: "jwk" }),
      private: privateKey.export({ format: "pem", type: "pkcs8" }).toString(),
    },
  };
  for (const [k, v] of Object.entries(settings)) {
    await d.query(`INSERT INTO settings(key,value) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING`, [k, JSON.stringify(v)]);
  }

  const zones: [string, string, string, boolean, number][] = [
    ["A", "الساحة الرئيسية", "Main Plaza", false, 20],
    ["B", "مواقف الزوار", "Visitor Parking", false, 40],
    ["C", "منطقة الخدمات", "Services Area", false, 15],
    ["D", "محيط جبل الرماة", "Archers' Hill Perimeter", true, 6],
    ["E", "المسار التاريخي", "Heritage Path", true, 4],
  ];
  for (const z of zones) {
    await d.query(
      `INSERT INTO zones(code,name_ar,name_en,sensitive,capacity_per_hour) VALUES ($1,$2,$3,$4,$5)`,
      z,
    );
  }
  await d.query(`INSERT INTO gates(name_ar,name_en,zone_ids) VALUES
    ('البوابة الشمالية','North Gate','{1,2,4}'),
    ('البوابة الجنوبية','South Gate','{1,3,5}'),
    ('بوابة الخدمات','Services Gate','{3}')`);

  const pw = await hashPassword(DEMO_PASSWORD);
  const users: [string, string, string[], string | null][] = [
    ["admin", "مسؤول النظام", ["admin"], null],
    ["reviewer", "سارة المراجعة", ["reviewer"], null],
    ["approver", "خالد المعتمد", ["approver"], null],
    ["supervisor", "مشرف الميدان", ["supervisor"], null],
    ["verifier", "متحقق البوابة", ["verifier"], "الجهة الأمنية المختصة"],
    ["opsmanager", "مدير التشغيل", ["opsmanager"], null],
  ];
  for (const [u, n, r, a] of users) {
    await d.query(`INSERT INTO users(username,name,password_hash,roles,agency) VALUES ($1,$2,$3,$4,$5)`, [u, n, pw, r, a]);
  }
  await d.query(`INSERT INTO settings(key,value) VALUES ('seeded','true')`);
}
