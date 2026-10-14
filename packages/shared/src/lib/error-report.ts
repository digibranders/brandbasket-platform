import { z } from "zod";

export const ERROR_OPERATIONS = ["server_render", "server_action", "server_route", "server_proxy", "browser_uncaught", "browser_rejection", "error_boundary", "support_submit", "support_attachment", "billing_checkout", "billing_payment", "booking_create"] as const;
export type ErrorOperation = (typeof ERROR_OPERATIONS)[number];
export type ErrorApp = "platform" | "admin";

const ERROR_CLASSES = ["Error", "TypeError", "ReferenceError", "RangeError", "SyntaxError", "URIError", "EvalError", "AggregateError", "DatabaseError", "DrizzleQueryError", "UnknownError"] as const;
const BROWSER_FAMILIES = ["Chrome", "Safari", "Firefox", "Edge", "Other", "Server"] as const;
const STATIC_SEGMENTS = new Set("app-host appointments patients practitioners services business account billing invoices payments charges profile settings team website listing photos videos directory signup sign-in sign-up sign-out reset-password forgot-password confirm-email verification setup onboarding support tickets errors clients leads affiliates referrals pricing geography outbox api auth site bookings availability info dashboard new edit details schedule calendar health support-attachments error-reports in".split(" "));
const FILE_PATTERN = /^(?:[a-f0-9]{6,}(?:\.[a-f0-9]+)?\.js|(?:page|route|error|global-error|layout|instrumentation|instrumentation-client)\.[tj]sx?)$/;
const RELEASE_PATTERN = /^[a-f0-9]{7,64}$/;

/** Static segments are explicitly allowlisted. Every dynamic or unfamiliar segment becomes a template token. */
export function normalizeErrorRoute(value: string): string {
  if (!value.startsWith("/") || value.startsWith("//")) return "/[id]";
  const path = value.split(/[?#]/, 1)[0] ?? "/";
  const segments = path.split("/").filter(Boolean).slice(0, 12);
  return `/${segments.map((segment) => STATIC_SEGMENTS.has(segment) ? segment : "[id]").join("/")}`;
}

export const sourceFrameSchema = z.strictObject({
  file: z.string().max(100).regex(FILE_PATTERN),
  line: z.number().int().min(1).max(10_000_000),
  column: z.number().int().min(0).max(10_000_000),
});
export type SafeSourceFrame = z.infer<typeof sourceFrameSchema>;

export const errorReportSchema = z.strictObject({
  eventId: z.uuid(),
  app: z.enum(["platform", "admin"]),
  operation: z.enum(ERROR_OPERATIONS),
  errorClass: z.enum(ERROR_CLASSES),
  route: z.string().max(300).refine((route) => normalizeErrorRoute(route) === route),
  release: z.string().refine((release) => release === "unknown" || RELEASE_PATTERN.test(release)),
  browser: z.enum(BROWSER_FAMILIES),
  severity: z.enum(["error", "fatal"]),
  frames: z.array(sourceFrameSchema).max(8),
});
export type ErrorReport = z.infer<typeof errorReportSchema>;

export interface ErrorReportContext {
  readonly app: ErrorApp;
  readonly operation: ErrorOperation;
  readonly route: string;
  readonly release?: string;
  readonly browser?: (typeof BROWSER_FAMILIES)[number];
  readonly severity?: "error" | "fatal";
}

/** Name/digest use own data properties. V8 computes stacks lazily; a broken stack getter is isolated. */
function errorProperty(error: unknown, key: "name" | "stack" | "digest"): unknown {
  if (!(error instanceof Error)) return undefined;
  try { return key === "stack" ? error.stack : Object.getOwnPropertyDescriptor(error, key)?.value; } catch { return undefined; }
}

/** Only file basenames we control and integer coordinates survive. No snippets, paths or function names. */
export function safeSourceFrames(stack: unknown): SafeSourceFrame[] {
  if (typeof stack !== "string") return [];
  const frames: SafeSourceFrame[] = [];
  for (const line of stack.slice(0, 16_384).split("\n").slice(1, 32)) {
    const match = /(?:\/|\()([a-zA-Z0-9._-]+)(?:\?[^\s:)]*)?:(\d+):(\d+)\)?$/.exec(line.trim());
    if (match === null) continue;
    const parsed = sourceFrameSchema.safeParse({ file: match[1], line: Number(match[2]), column: Number(match[3]) });
    if (parsed.success) frames.push(parsed.data);
    if (frames.length === 8) break;
  }
  return frames;
}

export function browserFamily(agent: string): (typeof BROWSER_FAMILIES)[number] {
  if (/Edg\//.test(agent)) return "Edge";
  if (/Firefox\//.test(agent)) return "Firefox";
  if (/Chrome\//.test(agent)) return "Chrome";
  if (/Safari\//.test(agent)) return "Safari";
  return "Other";
}

export function createErrorReport(error: unknown, context: ErrorReportContext): ErrorReport {
  let errorClass: ErrorReport["errorClass"] = "UnknownError";
  if (error instanceof Error) {
    const name = errorProperty(error, "name") ?? (error instanceof TypeError ? "TypeError" : error instanceof RangeError ? "RangeError" : error instanceof ReferenceError ? "ReferenceError" : error instanceof SyntaxError ? "SyntaxError" : "Error");
    if (ERROR_CLASSES.some((item) => item === name)) errorClass = name as ErrorReport["errorClass"];
  }
  return {
    eventId: crypto.randomUUID(), app: context.app, operation: context.operation,
    errorClass, route: normalizeErrorRoute(context.route),
    release: context.release !== undefined && RELEASE_PATTERN.test(context.release) ? context.release : "unknown",
    browser: context.browser ?? "Server", severity: context.severity ?? "error",
    frames: safeSourceFrames(errorProperty(error, "stack")),
  };
}

const seenErrors = new WeakSet<object>();
let windowStart = 0;
let windowCount = 0;
let inFlight = 0;
let installed = false;

/** Best effort, same-origin, bounded and never retried. Server component digests were already captured server-side. */
export function reportBrowserError(error: unknown, context: ErrorReportContext): void {
  try {
    if (typeof window === "undefined" || errorProperty(error, "digest") !== undefined) return;
    if (typeof error === "object" && error !== null) {
      if (seenErrors.has(error)) return;
      seenErrors.add(error);
    }
    const now = Date.now();
    if (now - windowStart >= 60_000) { windowStart = now; windowCount = 0; }
    if (windowCount >= 10 || inFlight >= 2) return;
    const report = createErrorReport(error, { ...context, browser: browserFamily(navigator.userAgent) });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2_000);
    windowCount += 1;
    inFlight += 1;
    void (async (): Promise<Response> => fetch("/api/error-reports", {
      method: "POST", credentials: "same-origin", headers: { "Content-Type": "application/json" },
      body: JSON.stringify(report), signal: controller.signal,
    }))().catch(() => undefined).finally(() => { clearTimeout(timeout); inFlight -= 1; });
  } catch { /* Monitoring must never affect the user's work. */ }
}

export function installBrowserErrorCapture(app: ErrorApp, release?: string): void {
  try {
    if (typeof window === "undefined" || installed) return;
    installed = true;
    window.addEventListener("error", (event) => reportBrowserError(event.error, { app, release, route: window.location.pathname, operation: "browser_uncaught" }));
    window.addEventListener("unhandledrejection", (event) => reportBrowserError(event.reason, { app, release, route: window.location.pathname, operation: "browser_rejection" }));
  } catch { /* An unavailable browser API must not stop hydration. */ }
}
