import { checkboxField, textField, type StepParseResult } from "./form-result";

const MAX_HOSTNAME_LENGTH = 253;
const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
/** Plain letters, or a punycode-encoded international TLD. */
const TOP_LEVEL = /^([a-z]{2,63}|xn--[a-z0-9-]{1,59})$/;
const SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

export interface DomainStepInput {
  readonly hostname: string;
  readonly ownerConfirmed: true;
}

/**
 * Turns whatever people paste — "https://www.YourBusiness.com/contact", "yourbusiness.com." — into the bare
 * lowercase hostname, with international names in their punycode form. Returns null when nothing usable is left.
 */
export function normalizeHostname(input: string): string | null {
  const trimmed = input.trim();
  if (trimmed === "") return null;

  let hostname: string;
  try {
    hostname = new URL(SCHEME.test(trimmed) ? trimmed : `https://${trimmed}`).hostname;
  } catch {
    return null;
  }

  const bare = hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
  return bare === "" ? null : bare;
}

export function isValidHostname(hostname: string): boolean {
  if (hostname.length > MAX_HOSTNAME_LENGTH) return false;
  const labels = hostname.split(".");
  if (labels.length < 2) return false;
  const topLevel = labels[labels.length - 1] ?? "";
  return labels.every((label) => LABEL.test(label)) && TOP_LEVEL.test(topLevel);
}

/** True for one of Fynix Digital's own hosts or anything under one of them. */
export function isReservedHostname(hostname: string, reserved: readonly string[]): boolean {
  return reserved.some((host) => hostname === host || hostname.endsWith(`.${host}`));
}

type Env = Readonly<Record<string, string | undefined>>;

/**
 * The domain a business's temporary address is made on (`<slug>.<base>`): CLIENT_SITE_BASE_DOMAIN when set, otherwise
 * nothing: the server never invents addresses on a domain it was not told to use, so until a base domain is set the
 * temporary address is simply not offered. A value that is not a domain is refused.
 */
export function clientSiteBaseDomain(env: Env = process.env): string | null {
  const configured = env.CLIENT_SITE_BASE_DOMAIN?.trim().toLowerCase().replace(/^\.+|\.+$/g, "") ?? "";
  if (configured !== "") {
    if (!isValidHostname(configured)) throw new Error(`CLIENT_SITE_BASE_DOMAIN must be a domain such as sites.example.com, received "${configured}"`);
    return configured;
  }
  return null;
}

/** Leaves room for "-" plus a 6-character disambiguator within the 63-character DNS label limit. */
const SUBDOMAIN_LABEL_MAX = 55;

/**
 * A free `<slug>.<base domain>` address for a business with no domain of their own yet. `disambiguator` is added when
 * the plain slug is already taken by another business's temporary address. Throws when no base domain is configured.
 */
export function temporarySubdomainFor(slug: string, disambiguator?: string, env: Env = process.env): string {
  const base = clientSiteBaseDomain(env);
  if (base === null) throw new Error("No temporary addresses are offered: set CLIENT_SITE_BASE_DOMAIN to the domain they are made on.");
  const trimmed = slug.slice(0, SUBDOMAIN_LABEL_MAX).replace(/-+$/, "");
  const label = disambiguator === undefined ? trimmed : `${trimmed}-${disambiguator}`;
  return `${label}.${base}`;
}

/** True for a placeholder address on the base domain, not a domain the customer registered themselves. */
export function isTemporarySubdomain(hostname: string, env: Env = process.env): boolean {
  const base = clientSiteBaseDomain(env);
  return base !== null && (hostname === base || hostname.endsWith(`.${base}`));
}

/**
 * Fynix Digital's own hostnames from its configured origins, for parseDomainForm: each origin's hostname with any
 * leading `www.` removed, since a customer's entry is compared the same way, plus `localhost`. An origin that is
 * not a URL is a configuration mistake and throws rather than leaving a host unguarded.
 */
export function reservedHostnamesFrom(origins: readonly string[]): string[] {
  const hosts = new Set<string>(["localhost"]);
  for (const origin of origins) {
    const hostname = new URL(origin).hostname.toLowerCase().replace(/\.$/, "").replace(/^www\./, "");
    if (hostname !== "") hosts.add(hostname);
  }
  return [...hosts];
}

/**
 * Step 04. `reservedHostnames` are Fynix Digital's own hosts, which no customer may claim; the action passes the real
 * list so this stays a pure function.
 */
export function parseDomainForm(formData: FormData, reservedHostnames: readonly string[]): StepParseResult<DomainStepInput> {
  const raw = textField(formData, "domain");
  const hostname = normalizeHostname(raw);

  if (hostname === null) {
    return { success: false, message: "Enter your domain, for example yourbusiness.com.", field: "domain" };
  }
  if (!isValidHostname(hostname) || hostname.endsWith(".localhost")) {
    return {
      success: false,
      message: "That doesn't look like a domain. It should look like yourbusiness.com.",
      field: "domain",
    };
  }
  if (isReservedHostname(hostname, reservedHostnames)) {
    return { success: false, message: "That address belongs to us. Enter your own domain.", field: "domain" };
  }
  if (!checkboxField(formData, "ownerConfirmed")) {
    return {
      success: false,
      message: "Tick the box to confirm this domain is yours.",
      field: "ownerConfirmed",
    };
  }

  return { success: true, data: { hostname, ownerConfirmed: true } };
}

/** The shortest and longest name a customer may choose for their free address (the part before the base domain). */
export const SUBDOMAIN_NAME_MIN = 3;
export const SUBDOMAIN_NAME_MAX = 40;

/**
 * Names no customer may take for a free address: our own hosts and the ones a visitor would trust, such as the console, the
 * mail and login names, and words that would pass for the company or a bank. The platform's own hostnames, read from its
 * configured origins, are refused as well wherever they sit under the base domain (see the action).
 */
export const RESERVED_SUBDOMAIN_NAMES: ReadonlySet<string> = new Set([
  "www", "app", "console", "staff", "admin", "administrator", "api", "mail", "email", "smtp", "imap", "pop", "ftp", "sftp", "ssh",
  "ns", "ns1", "ns2", "dns", "mx", "cdn", "static", "assets", "media", "files", "status", "help", "support", "billing", "pay",
  "payment", "payments", "invoice", "invoices", "login", "signin", "signup", "register", "account", "accounts", "dashboard",
  "secure", "security", "auth", "oauth", "sso", "verify", "fynix", "fynixdigital", "digital", "sites", "site", "blog", "shop",
  "store", "test", "testing", "staging", "dev", "demo", "preview", "localhost", "root", "postmaster", "webmaster", "abuse",
  "noreply", "no-reply", "oyechats", "razorpay", "bank", "paypal", "google", "microsoft", "apple", "whatsapp", "instagram",
  "facebook", "linkedin",
]);

const SUBDOMAIN_NAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type SubdomainNameReading = { readonly ok: true; readonly name: string } | { readonly ok: false; readonly message: string };

/**
 * Reads the name a customer typed for their free address. Lower-cased and trimmed; a base domain typed on the end
 * ("harbour.sites.fynix.digital") is dropped, so pasting the whole address works. Letters, numbers and single hyphens
 * only, 3 to 40 characters, and never a reserved name.
 */
export function readSubdomainName(input: string, baseDomain: string | null = null): SubdomainNameReading {
  let name = input.trim().toLowerCase();
  if (baseDomain !== null && name.endsWith(`.${baseDomain}`)) name = name.slice(0, -(baseDomain.length + 1));
  if (name === "") return { ok: false, message: "Choose a name for your free address." };
  if (!SUBDOMAIN_NAME_PATTERN.test(name)) return { ok: false, message: "Use only letters, numbers and single hyphens, with no spaces or dots." };
  if (name.length < SUBDOMAIN_NAME_MIN) return { ok: false, message: `Use at least ${SUBDOMAIN_NAME_MIN} letters or numbers.` };
  if (name.length > SUBDOMAIN_NAME_MAX) return { ok: false, message: `Keep it to ${SUBDOMAIN_NAME_MAX} characters or fewer.` };
  if (RESERVED_SUBDOMAIN_NAMES.has(name)) return { ok: false, message: "That name is kept for us. Choose another." };
  return { ok: true, name };
}

/**
 * The name to offer first, from the business's slug: the slug itself when it is a name a customer could take, else empty
 * so the box starts blank rather than offering something that would be refused.
 */
export function suggestSubdomainName(businessSlug: string): string {
  const trimmed = businessSlug.slice(0, SUBDOMAIN_NAME_MAX).replace(/-+$/g, "");
  return readSubdomainName(trimmed).ok ? trimmed : "";
}
