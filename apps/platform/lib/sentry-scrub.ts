import type { Breadcrumb, Event, Exception, StackFrame } from "@sentry/nextjs";

/**
 * Sentry is an external processor, and this app handles customer text (support requests, billing details, patient and
 * booking records). Everything that can carry that text is removed before an event leaves the process: request bodies,
 * query strings, cookies and headers, form and input values, breadcrumb messages and exception messages. What stays is
 * what triage needs: the exception type, the stack, the route path without its query, the release and the status code.
 * See docs/operations/automatic-errors.md.
 */

/** Everything from the first "?" or "#" onward is query or fragment, which can hold search terms and tokens. */
export function stripQuery(value: string): string {
  const cut = value.search(/[?#]/);
  return cut === -1 ? value : value.slice(0, cut);
}

/** For free text that holds URLs among other words, such as "GET https://host/path?q=1": cut each query. */
function stripQueriesInText(value: string): string {
  return value.replace(/[?#]\S*/g, "");
}

const SENSITIVE_DATA_KEY = /(^|[._-])(query|statement|body|cookie|cookies|text|value|values|headers?|params?|parameter)($|[._-])|db\.query\.parameter/i;
const URL_DATA_KEY = /(^|[._-])(url|full|to|from)($|[._-])/i;

/** Span and breadcrumb data: drop anything that can hold a query, a body or a value, and cut queries from URLs. */
function scrubData<T extends Record<string, unknown>>(data: T | undefined): T | undefined {
  if (data === undefined) return undefined;
  const clean: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_DATA_KEY.test(key)) continue;
    clean[key] = typeof value === "string" && URL_DATA_KEY.test(key) ? stripQuery(value) : value;
  }
  return clean as T;
}

/** Breadcrumbs are the trail before an error. Console output and typed input are dropped; no message survives. */
export function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb | null {
  const category = breadcrumb.category ?? "";
  if (category === "console" || category.startsWith("ui.input")) return null;
  const clean: Breadcrumb = { ...breadcrumb, message: undefined };
  if (category === "fetch" || category === "xhr") {
    const data = breadcrumb.data ?? {};
    clean.data = {
      method: data.method,
      status_code: data.status_code,
      url: typeof data.url === "string" ? stripQuery(data.url) : undefined,
    };
  } else if (category === "navigation") {
    const data = breadcrumb.data ?? {};
    clean.data = {
      from: typeof data.from === "string" ? stripQuery(data.from) : undefined,
      to: typeof data.to === "string" ? stripQuery(data.to) : undefined,
    };
  } else {
    clean.data = undefined;
  }
  return clean;
}

function scrubFrame(frame: StackFrame): StackFrame {
  return {
    ...frame,
    vars: undefined,
    filename: frame.filename === undefined ? undefined : stripQuery(frame.filename),
    abs_path: frame.abs_path === undefined ? undefined : stripQuery(frame.abs_path),
  };
}

/** Keeps the type, mechanism and stack. The message is dropped because it often quotes the input that failed. */
function scrubException(exception: Exception): Exception {
  const { stacktrace } = exception;
  return {
    ...exception,
    value: undefined,
    stacktrace: stacktrace === undefined ? undefined : { ...stacktrace, frames: stacktrace.frames?.map(scrubFrame) },
  };
}

/** Keeps the method and the URL path. Bodies, query strings, cookies, headers and env never leave the process. */
function scrubRequest(request: NonNullable<Event["request"]>): NonNullable<Event["request"]> {
  return {
    ...(request.method === undefined ? {} : { method: request.method }),
    ...(request.url === undefined ? {} : { url: stripQuery(request.url) }),
  };
}

/** Applies to errors and to transactions. Tracing settings are unchanged; only the data inside each event is cut. */
export function scrubEvent<T extends Event>(event: T): T {
  const clean: Event = { ...event };
  clean.request = event.request === undefined ? undefined : scrubRequest(event.request);
  clean.breadcrumbs = event.breadcrumbs?.flatMap((item) => {
    const scrubbed = scrubBreadcrumb(item);
    return scrubbed === null ? [] : [scrubbed];
  });
  clean.exception = event.exception === undefined ? undefined : { ...event.exception, values: event.exception.values?.map(scrubException) };
  clean.message = undefined;
  clean.logentry = undefined;
  clean.extra = undefined;
  clean.user = undefined;
  clean.threads = undefined;
  if (event.transaction !== undefined) clean.transaction = stripQuery(event.transaction);
  clean.spans = event.spans?.map((span) => ({
    ...span,
    description: span.description === undefined ? undefined : stripQueriesInText(span.description),
    data: scrubData(span.data) ?? {},
  }));
  if (event.contexts?.trace?.data !== undefined) {
    clean.contexts = { ...event.contexts, trace: { ...event.contexts.trace, data: scrubData(event.contexts.trace.data) } };
  }
  return clean as T;
}
