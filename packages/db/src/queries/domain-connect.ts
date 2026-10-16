import { and, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { domains, projects, type DomainStatus } from "../schema";

/** A staff write across tenants: the plain staff connection, or a transaction opened on it. */
type Runner = Database | ScopedTransaction;

export class DomainNotReadyForDnsError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no approved project with a domain to connect.`);
    this.name = "DomainNotReadyForDnsError";
  }
}

const PRIMARY = (businessId: string) => and(eq(domains.businessId, businessId), eq(domains.isPrimary, true), isNull(domains.removedAt));

/** The statuses from which the customer's own check may move the domain on, or back. */
const IN_DNS_STEP: readonly DomainStatus[] = ["awaiting_dns", "verifying", "misconfigured"];

export interface DomainReadyResult {
  readonly hostname: string;
  /** False when it was already waiting on the customer's DNS: pressing the button twice must not email them twice. */
  readonly changed: boolean;
}

/**
 * Staff have added the customer's own domain to the website's host and it is time for the customer to change their DNS:
 * the primary domain moves `pending` -> `awaiting_dns`, which is what makes the "connect your domain" card appear on the
 * customer's side. Only an `approved` project qualifies, so a customer is never asked to change DNS for a site they have not
 * signed off. Whether the domain is the customer's own or a free address is the caller's check: the base domain it ends in is
 * configuration this package does not read.
 */
export async function markDomainReadyForDns(db: Runner, input: { readonly businessId: string }): Promise<DomainReadyResult> {
  return db.transaction(async (tx) => {
    const approved = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.businessId, input.businessId), eq(projects.status, "approved")))
      .limit(1);
    const [domain] = await tx.select({ id: domains.id, hostname: domains.hostname, status: domains.status }).from(domains).where(PRIMARY(input.businessId)).limit(1);
    if (approved[0] === undefined || domain === undefined) throw new DomainNotReadyForDnsError(input.businessId);
    if (domain.status === "active") throw new DomainNotReadyForDnsError(input.businessId);
    if (domain.status !== "pending") return { hostname: domain.hostname, changed: false };

    await tx.update(domains).set({ status: "awaiting_dns" }).where(eq(domains.id, domain.id));
    return { hostname: domain.hostname, changed: true };
  });
}

export interface DnsCheckRecorded {
  /** True only the first time the check finds the domain connected: that is when the team is told. */
  readonly becameConnected: boolean;
}

/**
 * Records what the customer's "Check my domain" found. Connected moves `awaiting_dns` (or `misconfigured`) to `verifying`; a later
 * check that no longer finds it connected moves `verifying` back to `awaiting_dns`, and one that finds it pointing elsewhere marks it
 * `misconfigured`. A domain that is not in the DNS step (still `pending`, or already `active`) is never touched, and the check is
 * tied to the hostname it looked up, so a domain changed in between is left alone.
 */
export async function recordDomainDnsCheck(
  db: Runner,
  input: { readonly businessId: string; readonly hostname: string; readonly result: "connected" | "pending" | "elsewhere" },
): Promise<DnsCheckRecorded> {
  return db.transaction(async (tx) => {
    const [domain] = await tx.select({ id: domains.id, hostname: domains.hostname, status: domains.status }).from(domains).where(PRIMARY(input.businessId)).limit(1);
    if (domain === undefined || domain.hostname !== input.hostname || !IN_DNS_STEP.includes(domain.status)) return { becameConnected: false };

    const next: DomainStatus = input.result === "connected" ? "verifying" : input.result === "elsewhere" ? "misconfigured" : "awaiting_dns";
    if (next === domain.status) return { becameConnected: false };

    await tx.update(domains).set({ status: next }).where(and(eq(domains.id, domain.id), inArray(domains.status, [...IN_DNS_STEP])));
    return { becameConnected: next === "verifying" && domain.status !== "verifying" };
  });
}
