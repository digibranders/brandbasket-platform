/**
 * What is safe to write to the server log for an unexpected failure: enough to diagnose from the logs alone,
 * without writing the raw error (which can carry a stack trace, driver internals, or a fragment of a query --
 * Drizzle's own error puts the failed query's params straight into its message, which can include things like a
 * patient's name, phone or note, a customer's GSTIN and address, or a site API token) to stdout. Only an error's class
 * name and, when one is found on the error itself or anywhere along its cause chain, a Postgres error code ever leave
 * errorLogInfo -- never `error.message` itself.
 *
 * The single home for this across the apps: every catch block that needs to log an unexpected error calls
 * errorLogInfo (or, where the caller has extra context to attach, wraps it -- see `loggableBookingError` in the
 * platform app's `lib/server/booking-log.ts`, and `describeError` in `./billing-log`). Three companions live here too:
 * `constraintOf` (the database constraint a failure broke), `providerErrorInfo` (a payment provider's error code and
 * HTTP status, the two non-personal fields a provider failure carries) and `isConnectionFailure` (whether the failure
 * was the database connection itself).
 */
export interface SafeErrorLog {
  readonly errorName: string;
  readonly pgCode: string | null;
}

export function errorLogInfo(error: unknown): SafeErrorLog {
  return { errorName: error instanceof Error ? error.name : "UnknownError", pgCode: postgresCodeOf(error) };
}

/** How far down a cause chain to look. A DrizzleQueryError wrapping pg's DatabaseError is two deep. */
const MAX_CAUSE_DEPTH = 5;

/** The first string a property holds along the cause chain (the error itself first), or null. */
function firstAlongCauses(error: unknown, property: "code" | "constraint"): string | null {
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < MAX_CAUSE_DEPTH; depth += 1) {
    const value = (current as { readonly code?: unknown; readonly constraint?: unknown })[property];
    if (typeof value === "string") return value;
    current = current.cause;
  }
  return null;
}

/** The Postgres error code nearest the top of the cause chain (including the error itself), if there is one --
 * covers both a plain object carrying a `.code` string and `pg`'s own `DatabaseError`, without needing to import
 * `pg` just to recognize its shape. */
function postgresCodeOf(error: unknown): string | null {
  return firstAlongCauses(error, "code");
}

/**
 * The name of the constraint a database error broke ("tax_invoices_payment_check"), from pg's DatabaseError anywhere
 * along the cause chain, or null. A constraint name is ours, never a customer's data, so it is safe to log.
 */
export function constraintOf(error: unknown): string | null {
  return firstAlongCauses(error, "constraint");
}

/** What a provider error code looks like ("BAD_REQUEST_ERROR", "ECONNRESET"). Anything else is not logged. */
const PROVIDER_CODE_PATTERN = /^[A-Za-z0-9_.-]{2,64}$/;

/** A payment provider's or network's failure, reduced to the two fields that hold no personal data. */
export interface ProviderErrorInfo {
  readonly providerCode: string | null;
  readonly httpStatus: number | null;
}

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function codeIn(value: unknown): string | null {
  return typeof value === "string" && PROVIDER_CODE_PATTERN.test(value) ? value : null;
}

function statusIn(value: unknown): number | null {
  return typeof value === "number" && Number.isInteger(value) && value >= 100 && value <= 599 ? value : null;
}

/**
 * The provider's error code and HTTP status, wherever they sit on the failure or along its cause chain. Razorpay's SDK
 * rejects with a plain object, not an Error: `{ statusCode, error: { code, description, reason, metadata, ... } }`;
 * a network failure is an Error with a top-level `code` such as "ECONNRESET". Only a code that looks like a code and
 * an integer status in 100 to 599 are returned. `description`, `reason`, `metadata`, `field` and every message are
 * free text that can quote what the customer typed, so they are never read.
 */
export function providerErrorInfo(error: unknown): ProviderErrorInfo {
  let providerCode: string | null = null;
  let httpStatus: number | null = null;
  let current: unknown = error;
  for (let depth = 0; isRecord(current) && depth < MAX_CAUSE_DEPTH; depth += 1) {
    providerCode ??= codeIn(isRecord(current.error) ? current.error.code : undefined) ?? codeIn(current.code);
    httpStatus ??= statusIn(current.statusCode) ?? statusIn(current.status);
    current = current.cause;
  }
  return { providerCode, httpStatus };
}

/**
 * Postgres codes for a connection that failed or was shut down: the connection exceptions of class 08 that mean a
 * lost or refused connection (not 08P01, a protocol fault in the query itself), and an administrator or crash shutdown.
 */
const CONNECTION_SQLSTATES = new Set(["08000", "08001", "08003", "08004", "08006", "08007", "57P01", "57P02", "57P03"]);
/** Node's socket error codes for a server that went away or could not be reached. */
const SOCKET_CODES = new Set(["ECONNRESET", "ECONNREFUSED", "ETIMEDOUT", "EPIPE", "EHOSTUNREACH", "ENOTFOUND"]);
/** What the pg client says, with no code, when its connection or pool is gone. Only matched, never logged. */
const CONNECTION_MESSAGE = /connection terminated|client was closed|cannot use a pool after calling end|client has encountered a connection error/i;

/** A Drizzle query error carries the failed query and its params, and repeats them in its message. */
function carriesQuery(error: Error): boolean {
  return "query" in error || "params" in error;
}

/**
 * Whether a failure was the database connection itself rather than the query: retrying the work on the same
 * transaction cannot succeed, so a caller that swallows query failures should let these through. The message is read
 * only on errors that carry no query or params, since a query error's message embeds customer data.
 */
export function isConnectionFailure(error: unknown): boolean {
  const code = postgresCodeOf(error);
  if (code !== null && (CONNECTION_SQLSTATES.has(code) || SOCKET_CODES.has(code))) return true;
  let current: unknown = error;
  for (let depth = 0; current instanceof Error && depth < MAX_CAUSE_DEPTH; depth += 1) {
    if (!carriesQuery(current) && CONNECTION_MESSAGE.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}
