import { z } from "zod";

/** The longest link a customer may give us, as typed and as stored. */
export const MAX_URL_LENGTH = 500;

/**
 * Hosts whose every link may be a Google Business Profile: Maps, the profile manager, and Google's Maps short links.
 * share.google is deliberately absent: the Google app's share links can point at any Search result, not just a
 * business profile, so a customer should give the Maps link instead.
 */
const GOOGLE_PROFILE_HOSTS: ReadonlySet<string> = new Set([
  "maps.google.com",
  "business.google.com",
  "g.page",
  "maps.app.goo.gl",
]);

/** Google's main hosts serve far more than profiles (search, redirects), so only these top-level paths count. */
const GOOGLE_MAIN_HOSTS: ReadonlySet<string> = new Set(["www.google.com", "google.com"]);
const GOOGLE_MAIN_PATH_PREFIXES = ["/maps", "/business"] as const;

function hasPathPrefix(pathname: string, prefix: string): boolean {
  return pathname === prefix || pathname.startsWith(`${prefix}/`);
}

/**
 * Whether a link can be a Google Business Profile. Hosts are compared whole, never by suffix, so look-alikes such as
 * evilgoogle.com and google.com.evil.io fail, and so do Google's other subdomains (sites.google.com serves pages
 * anyone can write). On www.google.com and google.com only /maps and /business count, which keeps out /url?q=...
 * redirects to anywhere. A link on a non-default port is refused.
 */
export function isGoogleBusinessUrl(url: URL): boolean {
  if (url.port !== "") return false;
  const host = url.hostname.toLowerCase().replace(/\.$/, "");
  if (GOOGLE_PROFILE_HOSTS.has(host)) return true;
  if (!GOOGLE_MAIN_HOSTS.has(host)) return false;
  return GOOGLE_MAIN_PATH_PREFIXES.some((prefix) => hasPathPrefix(url.pathname, prefix));
}

export interface HttpsUrlMessages {
  /** Not an https:// link at all. */
  readonly invalid: string;
  readonly tooLong: string;
}

/**
 * A required https:// link, trimmed, at most MAX_URL_LENGTH characters both as typed and once normalised, with no
 * user name or password in it. The output is the normalised `URL.href`, so what is stored is what a browser would
 * open.
 */
export function httpsUrl(messages: HttpsUrlMessages) {
  return z
    .string()
    .trim()
    .max(MAX_URL_LENGTH, messages.tooLong)
    .pipe(z.url({ protocol: /^https$/, error: messages.invalid }))
    .transform((value) => new URL(value))
    .refine((url) => url.username === "" && url.password === "", messages.invalid)
    .transform((url) => url.href)
    .pipe(z.string().max(MAX_URL_LENGTH, messages.tooLong));
}

/**
 * A trimmed field that may be left blank (null) or must otherwise pass `schema`, reporting the schema's own
 * message. A union would hide that message behind a generic "Invalid input".
 */
export function blankOr<T>(schema: z.ZodType<T, string>) {
  return z
    .string()
    .trim()
    .transform((value, context): T | null => {
      if (value === "") return null;
      const parsed = schema.safeParse(value);
      if (parsed.success) return parsed.data;
      for (const issue of parsed.error.issues) context.addIssue({ code: "custom", message: issue.message });
      return z.NEVER;
    });
}
