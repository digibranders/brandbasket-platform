/**
 * The DNS records a customer adds at their registrar to point their own domain at their website, which runs on
 * Vercel, and how to read what their DNS says now.
 *
 * Vercel's long-standing generic answers are used: an A record to 76.76.21.21 for a bare domain and a CNAME to
 * cname.vercel-dns.com for a subdomain such as www. Only these two records are ever asked for: the customer's mail
 * (MX, SPF) and any other records stay as they are.
 */
export const VERCEL_APEX_IP = "76.76.21.21";
export const VERCEL_CNAME_TARGET = "cname.vercel-dns.com";

export type DnsRecordType = "A" | "CNAME";

export interface DnsRecord {
  readonly type: DnsRecordType;
  /** What the registrar calls the host: `@` for the bare domain, or the label (`www`). */
  readonly host: string;
  readonly value: string;
  /** The full name this record answers for, for the check and for showing alongside the host. */
  readonly fullName: string;
}

/** Second-level public suffixes common for customers here (example.co.in, example.com.au), where the bare domain has three labels. */
const SECOND_LEVEL_SUFFIX = /^(co|com|org|net|gov|ac|edu|nic|res)\.[a-z]{2}$/;

/** The registrable domain of a hostname: example.com, or example.co.in. */
export function registrableDomain(hostname: string): string {
  const labels = hostname.toLowerCase().split(".");
  if (labels.length <= 2) return labels.join(".");
  const lastTwo = labels.slice(-2).join(".");
  return SECOND_LEVEL_SUFFIX.test(lastTwo) ? labels.slice(-3).join(".") : lastTwo;
}

/**
 * The records for the address the customer entered. A bare domain (or its www form) gets both: the bare domain and www,
 * so either reaches the site. Any other subdomain (shop.example.com) gets one CNAME for that name.
 */
export function dnsRecordsFor(hostname: string): readonly DnsRecord[] {
  const name = hostname.trim().toLowerCase();
  const root = registrableDomain(name);
  if (name === root || name === `www.${root}`) {
    return [
      { type: "A", host: "@", value: VERCEL_APEX_IP, fullName: root },
      { type: "CNAME", host: "www", value: VERCEL_CNAME_TARGET, fullName: `www.${root}` },
    ];
  }
  const label = name.slice(0, name.length - root.length - 1);
  return [{ type: "CNAME", host: label, value: VERCEL_CNAME_TARGET, fullName: name }];
}

/** What a lookup of one record's name found. */
export interface DnsLookup {
  readonly aRecords: readonly string[];
  readonly cnames: readonly string[];
}

/** `connected` points at us; `pending` has nothing yet; `elsewhere` points somewhere else (a current website, say). */
export type DnsStatus = "connected" | "pending" | "elsewhere";

function normalizeHost(value: string): string {
  return value.trim().toLowerCase().replace(/\.$/, "");
}

/** Whether one record's name now points where it should. */
export function dnsRecordStatus(record: DnsRecord, found: DnsLookup): DnsStatus {
  const cnames = found.cnames.map(normalizeHost);
  const addresses = found.aRecords.map(normalizeHost);
  if (cnames.length === 0 && addresses.length === 0) return "pending";
  if (record.type === "CNAME") {
    // Vercel accepts a CNAME to its target; behind it the name resolves to Vercel addresses, which is also a match.
    return cnames.includes(record.value) || (cnames.length === 0 && addresses.includes(VERCEL_APEX_IP)) ? "connected" : "elsewhere";
  }
  return addresses.includes(record.value) ? "connected" : "elsewhere";
}

/** Every record connected means the domain is; any record pointing elsewhere is reported over one still pending. */
export function overallDnsStatus(statuses: readonly DnsStatus[]): DnsStatus {
  if (statuses.length > 0 && statuses.every((status) => status === "connected")) return "connected";
  return statuses.includes("elsewhere") ? "elsewhere" : "pending";
}
