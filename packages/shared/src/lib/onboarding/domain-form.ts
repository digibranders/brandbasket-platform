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
