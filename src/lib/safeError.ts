// Shared between API routes. Our own refusals are short codes ("not_found", "expired", "no_reviewer");
// anything else is an internal message (SQL, stack details) that must never be echoed to a browser.
export const publicError = (e: unknown, fallback = "bad_request") => {
  const m = e instanceof Error ? e.message : "";
  return /^[a-z][a-z0-9_]{1,40}$/.test(m) ? m : fallback;
};
