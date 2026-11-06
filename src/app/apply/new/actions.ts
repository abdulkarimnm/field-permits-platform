"use server";
import { redirect } from "next/navigation";
import { requireApplicant } from "@/lib/auth";
import { q1 } from "@/lib/db";
import { saveAttachments } from "@/lib/files";
import { resubmitRequest, submitRequest, validateRequest, type FieldError, type RequestInput } from "@/lib/permits";

export type SubmitState = { errors: FieldError[]; fileErrors?: string[] };

function sanitize(raw: unknown): RequestInput {
  const r = (raw ?? {}) as Partial<RequestInput>;
  const str = (v: unknown, n = 300) => String(v ?? "").trim().slice(0, n);
  return {
    org_name: str(r.org_name, 200),
    cr_number: str(r.cr_number, 10) || undefined,
    rep_name: str(r.rep_name, 120),
    rep_phone: str(r.rep_phone, 10),
    rep_id: str(r.rep_id, 10),
    purpose: str(r.purpose, 1000),
    valid_from: str(r.valid_from, 40),
    valid_to: str(r.valid_to, 40),
    zones: Array.isArray(r.zones) ? r.zones.map(Number).filter((n) => n > 0).slice(0, 20) : [],
    slot_date: /^\d{4}-\d{2}-\d{2}$/.test(String(r.slot_date ?? "")) ? String(r.slot_date) : null,
    slot_hour: r.slot_hour == null || r.slot_hour === ("" as never) ? null : Number(r.slot_hour),
    people: (Array.isArray(r.people) ? r.people : []).slice(0, 101).map((p) => ({ name: str(p?.name, 120), id_number: str(p?.id_number, 10) })),
    vehicles: (Array.isArray(r.vehicles) ? r.vehicles : []).slice(0, 51).map((v) => ({ plate: str(v?.plate, 20), type: str(v?.type, 60), ...(v?.kind === "sa" || v?.kind === "other" ? { kind: v.kind } : {}) })),
    equipment: (Array.isArray(r.equipment) ? r.equipment : []).slice(0, 51).map((x) => ({
      name: str(x?.name, 120), qty: Math.max(0, Math.floor(Number(x?.qty) || 0)),
      ...(x?.kind ? { kind: str(x.kind, 20) } : {}), ...(x?.serial ? { serial: str(x.serial, 40) } : {}),
    })),
    declaration: r.declaration === true,
  };
}

export async function submitAction(_: SubmitState, fd: FormData): Promise<SubmitState> {
  const contact = await requireApplicant();
  let parsed: unknown;
  try {
    parsed = JSON.parse(String(fd.get("payload") ?? "{}"));
  } catch {
    return { errors: [{ field: "form", ar: "تعذر قراءة النموذج", en: "Could not read the form" }] };
  }
  const r = sanitize(parsed);
  const errors = validateRequest(r);
  if (errors.length) return { errors };

  const files = fd.getAll("files").filter((f): f is File => f instanceof File && f.size > 0);
  const labels = fd.getAll("labels").map(String);
  const mode = String(fd.get("mode") ?? "new");
  let id: number;

  if (mode === "resubmit") {
    id = Number(fd.get("id"));
    try {
      await resubmitRequest(contact, id, r);
    } catch {
      return { errors: [{ field: "form", ar: "لا يمكن إعادة تقديم هذا الطلب", en: "This request cannot be resubmitted" }] };
    }
  } else if (mode === "amend") {
    const permitId = Number(fd.get("permitId"));
    const p = await q1<{ id: number; status: string }>(`SELECT id,status FROM permits WHERE id=$1 AND contact=$2`, [permitId, contact]);
    if (!p || p.status === "revoked") return { errors: [{ field: "form", ar: "لا يمكن تعديل هذا التصريح", en: "This permit cannot be amended" }] };
    const pending = await q1(`SELECT 1 FROM requests WHERE permit_id=$1 AND kind='amendment' AND status IN ('pending_review','pending_approval','returned')`, [permitId]);
    if (pending) return { errors: [{ field: "form", ar: "يوجد طلب تعديل قيد المراجعة لهذا التصريح", en: "An amendment is already under review" }] };
    id = (await submitRequest(contact, r, permitId)).id;
  } else {
    id = (await submitRequest(contact, r)).id;
  }
  const fileErrors = files.length ? await saveAttachments(id, files.map((file, i) => ({ file, label: labels[i] ?? "" }))) : [];
  redirect(`/apply/r/${id}${fileErrors.length ? "?files=" + fileErrors.length : "?ok=1"}`);
}
