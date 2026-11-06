// Shared between browser and server — no server-only imports.
/* ─────────────────────────────────────────────────────────────
   Single source of truth for staff permissions (RBAC).
   Mirrors the client's role table ("الصلاحيات وحماية البيانات"):
   every role sees only what its job needs, and there are NO hidden
   super-powers — the system admin manages users and settings but cannot
   review, approve, suspend or verify unless explicitly given that role.
   Stage ownership (who may act on stage 1 / stage 2) and separation of
   duties are enforced on top of this, per request.
   ───────────────────────────────────────────────────────────── */

export type Role = "admin" | "reviewer" | "approver" | "supervisor" | "verifier";

export const CAPS = {
  // requests
  "request.view": { ar: "الاطلاع على الطلبات", en: "View requests", group: "requests" },
  "request.attachments": { ar: "الاطلاع على المرفقات", en: "View attachments", group: "requests" },
  "request.review": { ar: "المراجعة الأولية (عند الإسناد)", en: "Initial review (when assigned)", group: "requests" },
  "request.approve": { ar: "الاعتماد النهائي وإصدار التصريح (عند الإسناد)", en: "Final approval & issue (when assigned)", group: "requests" },
  // permits
  "permit.view": { ar: "الاطلاع على التصاريح", en: "View permits", group: "permits" },
  "permit.manage": { ar: "إيقاف التصاريح وإعادة تفعيلها وإلغاؤها", en: "Suspend, reinstate & revoke permits", group: "permits" },
  "capacity.view": { ar: "السعة والحجوزات", en: "Capacity & bookings", group: "permits" },
  // field
  "verify.scan": { ar: "التحقق الميداني عند البوابة (دخول وخروج)", en: "Field verification (entry & exit)", group: "field" },
  "ops.view": { ar: "غرفة العمليات وشاشة العرض", en: "Operations room & wall screen", group: "field" },
  // oversight
  "reports.view": { ar: "التقارير ومؤشرات النجاح", en: "Reports & success metrics", group: "oversight" },
  "reports.export": { ar: "تصدير التقارير Excel / PDF", en: "Export reports (Excel / PDF)", group: "oversight" },
  "audit.view": { ar: "سجل العمليات", en: "Audit log", group: "oversight" },
  // governance
  "users.manage": { ar: "المستخدمون والأدوار", en: "Users & roles", group: "governance" },
  "settings.manage": { ar: "مسؤولو المراحل والمناطق والإعدادات", en: "Stage owners, zones & settings", group: "governance" },
  "errors.view": { ar: "سجل الأخطاء التقنية", en: "Technical error log", group: "governance" },
} as const;
export type Cap = keyof typeof CAPS;

export const CAP_GROUPS: { id: string; ar: string; en: string }[] = [
  { id: "requests", ar: "الطلبات", en: "Requests" },
  { id: "permits", ar: "التصاريح", en: "Permits" },
  { id: "field", ar: "الميدان", en: "Field" },
  { id: "oversight", ar: "الرقابة", en: "Oversight" },
  { id: "governance", ar: "الحوكمة", en: "Governance" },
];

export const ROLE_INFO: Record<Role, { ar: string; en: string; job: [string, string]; tone: string }> = {
  reviewer: { ar: "مراجع أولي", en: "Initial reviewer", job: ["يدقق الطلبات ومرفقاتها ويقرر: اعتماد أولي أو إعادة للاستكمال أو رفض.", "Checks requests and attachments; approves, returns or rejects at stage 1."], tone: "#3aa0c8" },
  approver: { ar: "معتمد نهائي", en: "Final approver", job: ["يعتمد الطلبات نهائيًا فيصدر التصريح، ويوقف التصاريح أو يلغيها.", "Gives final approval (issuing the permit) and suspends or revokes permits."], tone: "#2f9a66" },
  supervisor: { ar: "مشرف الميدان", en: "Field supervisor", job: ["يتابع الميدان لحظيًا والتصاريح والسجل، ويوقف أو يلغي، ويتحقق ميدانيًا.", "Watches the field live, permits and the log; suspends or revokes; verifies in the field."], tone: "#d9a441" },
  verifier: { ar: "متحقق ميداني", en: "Field verifier", job: ["يعمل عند البوابة فقط: يمسح الرمز ويطابق الحاضرين ويسجل الدخول والخروج.", "Works at the gate only: scans codes, matches who's present, records entry and exit."], tone: "#e0524a" },
  admin: { ar: "مسؤول النظام", en: "System admin", job: ["يدير المستخدمين والأدوار ومسؤولي المراحل والمناطق والإعدادات — دون صلاحية القرار على الطلبات.", "Manages users, roles, stage owners, zones and settings — without deciding on requests."], tone: "#8a6fc0" },
};

/** The matrix. Read it as: this role may do exactly these things — nothing more. */
export const ROLE_CAPS: Record<Role, Cap[]> = {
  reviewer: ["request.view", "request.attachments", "request.review", "permit.view", "capacity.view"],
  approver: ["request.view", "request.attachments", "request.approve", "permit.view", "permit.manage", "capacity.view", "ops.view", "reports.view", "reports.export"],
  supervisor: ["request.view", "request.attachments", "permit.view", "permit.manage", "capacity.view", "verify.scan", "ops.view", "reports.view", "reports.export", "audit.view"],
  verifier: ["verify.scan"],
  admin: ["users.manage", "settings.manage", "audit.view", "errors.view"],
};

export const ROLES = Object.keys(ROLE_INFO) as Role[];

export const capsOf = (roles: readonly string[]) => new Set(roles.flatMap((r) => ROLE_CAPS[r as Role] ?? []));
export const can = (u: { roles: readonly string[] } | null | undefined, cap: Cap) => !!u && capsOf(u.roles).has(cap);
export const canAny = (u: { roles: readonly string[] } | null | undefined, ...caps: Cap[]) => caps.some((c) => can(u, c));
export const rolesWith = (cap: Cap) => ROLES.filter((r) => ROLE_CAPS[r].includes(cap));

/** Home page of each role — where signing in takes you. */
export const ROLE_HOME: Record<Role, string> = { reviewer: "/staff", approver: "/staff", supervisor: "/staff", verifier: "/verify", admin: "/staff" };
