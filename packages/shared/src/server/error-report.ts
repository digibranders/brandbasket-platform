import "server-only";
import { consumeRateLimit, recordErrorReport, type Database, type RateLimitRule } from "@firstfold/db";
import { browserFamily, createErrorReport, errorReportSchema, type ErrorApp, type ErrorReport, type ErrorReportContext } from "../lib/error-report";

export interface ServerErrorContext extends ErrorReportContext { readonly userId?: string }
export interface ErrorWriter { (report: ErrorReport, userId?: string): Promise<string | null> }

async function bounded<T>(work: Promise<T>, fallback: T, timeoutMs = 2_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([work, new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), timeoutMs); })]);
  } finally { if (timer !== undefined) clearTimeout(timer); }
}

export function createServerErrorReporter(deps: { readonly writeReport: ErrorWriter; readonly allowReport?: () => Promise<boolean> }): (error: unknown, context: ServerErrorContext) => Promise<string | null> {
  const seen = new WeakSet<object>();
  let inFlight = 0;
  let start = 0;
  let count = 0;
  return async (error, context): Promise<string | null> => {
    try {
      const now = Date.now();
      if (now - start >= 60_000) { start = now; count = 0; }
      if (inFlight >= 4 || count >= 30) return null;
      if (typeof error === "object" && error !== null) { if (seen.has(error)) return null; seen.add(error); }
      const report = createErrorReport(error, context);
      inFlight += 1;
      count += 1;
      try {
        return await bounded((async (): Promise<string | null> => {
          if (deps.allowReport !== undefined && !await deps.allowReport()) return null;
          return deps.writeReport(report, context.userId);
        })(), null);
      } finally { inFlight -= 1; }
    } catch { return null; }
  };
}

/** Native default store; no external credentials or provider are involved. */
export function createDatabaseErrorReporter(getStaffDb: () => Database): ReturnType<typeof createServerErrorReporter> {
  return createServerErrorReporter({
    writeReport: (report, userId) => recordErrorReport(getStaffDb(), report, userId),
    allowReport: async () => (await consumeRateLimit(getStaffDb(), "automatic-errors:server:global", { limit: 120, windowSeconds: 60 })).allowed,
  });
}

export interface ErrorCollectorDependencies {
  readonly app: ErrorApp;
  /** The origin this report must come from. Given the request, so an app served on two hosts can answer for the one asked. */
  readonly getOrigin: (request: Request) => string;
  readonly getSessionUser: () => Promise<{ readonly id: string } | null>;
  readonly writeReport: ErrorWriter;
  readonly consumeLimit: (key: string, rule: RateLimitRule) => Promise<boolean>;
  readonly release?: string;
}

const MAX_BODY_BYTES = 8_192;
const CLIENT_OPERATIONS = new Set(["browser_uncaught", "browser_rejection", "error_boundary"]);

async function readBoundedBody(request: Request): Promise<{ readonly kind: "body"; readonly text: string } | { readonly kind: "oversized" }> {
  if (Number(request.headers.get("content-length")) > MAX_BODY_BYTES) return { kind: "oversized" };
  const reader = request.body?.getReader();
  if (reader === undefined) return { kind: "body", text: "" };
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  const timer = setTimeout(() => { void reader.cancel().catch(() => undefined); }, 1_000);
  try {
    while (true) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_BODY_BYTES) { void reader.cancel().catch(() => undefined); return { kind: "oversized" }; }
      text += decoder.decode(chunk.value, { stream: true });
    }
    return { kind: "body", text: text + decoder.decode() };
  } finally { clearTimeout(timer); reader.releaseLock(); }
}

/**
 * The host the browser asked for. Behind the proxy (nginx sets `Host $host`) the request's own URL carries the server's
 * hostname and port rather than the public one, so the Host header is read first. The URL is the fallback for a request
 * built without one, as in tests.
 */
function requestHost(request: Request): string {
  const header = request.headers.get("host")?.trim().toLowerCase();
  return header !== undefined && header !== "" ? header : new URL(request.url).host;
}

/** Origin/host constrained, strictly validated, bounded collector. Identity is never accepted in JSON. */
export function createErrorReportCollector(deps: ErrorCollectorDependencies): (request: Request) => Promise<Response> {
  let inFlight = 0;
  return async (request): Promise<Response> => {
    if (inFlight >= 4) return new Response(null, { status: 429 });
    inFlight += 1;
    try {
      return await bounded((async (): Promise<Response> => {
        const origin = new URL(deps.getOrigin(request)).origin;
        if (request.method !== "POST") return new Response(null, { status: 405 });
        if (request.headers.get("origin") !== origin || requestHost(request) !== new URL(origin).host) return new Response(null, { status: 403 });
        if (request.headers.get("content-type")?.split(";", 1)[0]?.trim() !== "application/json") return new Response(null, { status: 415 });
        // A global database bucket bounds anonymous traffic even if a forwarding header is spoofed.
        if (!await deps.consumeLimit(`automatic-errors:browser:${deps.app}:global`, { limit: 120, windowSeconds: 60 })) return new Response(null, { status: 429 });
        const ip = (request.headers.get("x-forwarded-for")?.split(",", 1)[0] ?? request.headers.get("x-real-ip") ?? "unknown").trim().slice(0, 100);
        if (!await deps.consumeLimit(`automatic-errors:browser:${deps.app}:ip:${ip}`, { limit: 20, windowSeconds: 60 })) return new Response(null, { status: 429 });
        const body = await readBoundedBody(request);
        if (body.kind === "oversized") return new Response(null, { status: 413 });
        let json: unknown;
        try { json = JSON.parse(body.text); } catch { return new Response(null, { status: 400 }); }
        const parsed = errorReportSchema.safeParse(json);
        if (!parsed.success || parsed.data.app !== deps.app || !CLIENT_OPERATIONS.has(parsed.data.operation)) return new Response(null, { status: 400 });
        const user = await deps.getSessionUser();
        if (user !== null && !await deps.consumeLimit(`automatic-errors:browser:${deps.app}:user:${user.id}`, { limit: 20, windowSeconds: 60 })) return new Response(null, { status: 429 });
        const report = { ...parsed.data, browser: browserFamily(request.headers.get("user-agent") ?? ""), release: createErrorReport(undefined, { app: deps.app, operation: "browser_uncaught", route: "/", release: deps.release }).release };
        await deps.writeReport(report, user?.id);
        return new Response(null, { status: 204 });
      })(), new Response(null, { status: 204 }));
    } catch { return new Response(null, { status: 204 }); }
    finally { inFlight -= 1; }
  };
}
