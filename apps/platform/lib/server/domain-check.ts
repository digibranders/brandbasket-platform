import "server-only";
import { Resolver } from "node:dns/promises";
import { dnsRecordsFor, dnsRecordStatus, overallDnsStatus, type DnsLookup, type DnsRecord, type DnsStatus } from "@fynix/shared/lib/onboarding/domain-dns";

export interface DomainCheck {
  readonly overall: DnsStatus;
  readonly records: readonly { readonly host: string; readonly status: DnsStatus }[];
}

/** Codes a resolver gives for "nothing there": an answer for the check ("pending"), not a failure. */
const NOTHING_THERE: ReadonlySet<string> = new Set(["ENODATA", "ENOTFOUND", "ENOENT"]);

async function orNothing(lookup: Promise<string[]>): Promise<string[]> {
  try {
    return await lookup;
  } catch (error) {
    if (error instanceof Error && "code" in error && NOTHING_THERE.has(String((error as { code: unknown }).code))) return [];
    throw error;
  }
}

async function lookupRecord(resolver: Resolver, record: DnsRecord): Promise<DnsLookup> {
  const [aRecords, cnames] = await Promise.all([
    orNothing(resolver.resolve4(record.fullName)),
    orNothing(resolver.resolveCname(record.fullName)),
  ]);
  return { aRecords, cnames };
}

/**
 * Looks up the records a customer was asked to add for `hostname` and says whether they now point at the website's host.
 * `hostname` is always the one stored for the signed-in business, never something typed into the check, so this cannot be
 * used to probe arbitrary names. Throws when the DNS service cannot be reached, which the caller shows as "try again".
 */
export async function checkDomainDns(hostname: string, resolver: Resolver = new Resolver({ timeout: 3000, tries: 2 })): Promise<DomainCheck> {
  const records = dnsRecordsFor(hostname);
  const results = await Promise.all(
    records.map(async (record) => ({ host: record.host, status: dnsRecordStatus(record, await lookupRecord(resolver, record)) })),
  );
  return { overall: overallDnsStatus(results.map((result) => result.status)), records: results };
}
