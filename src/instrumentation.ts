/* Next.js instrumentation: every unhandled server error (pages, route handlers,
   server actions, middleware) is written to the technical error log. */
export async function register() {}

export async function onRequestError(
  err: unknown,
  request: { path: string; method: string; headers: Record<string, string | string[] | undefined> },
  context: { routerKind: string; routePath: string; routeType: "render" | "route" | "action" | "middleware" },
) {
  // Keep the import inside this static check so the Edge bundle drops it (pg/pglite need Node's fs).
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { logError } = await import("./lib/errors");
    const e = err as Error & { digest?: string };
    const ua = request.headers["user-agent"];
    await logError({
      source: context.routeType === "route" ? "api" : context.routeType === "action" ? "action" : "server",
      message: e?.message ?? String(err),
      stack: e?.stack,
      path: request.path,
      method: request.method,
      digest: e?.digest,
      userAgent: Array.isArray(ua) ? ua[0] : ua,
    });
  }
}
