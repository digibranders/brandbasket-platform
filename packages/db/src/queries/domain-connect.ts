import { and, asc, eq, inArray, isNull } from "drizzle-orm";
import type { Database } from "../client";
import type { ScopedTransaction } from "../scope";
import { domains, projects, type DomainStatus } from "../schema";
import { setBusinessWebsiteUrl } from "./business-website";
import { DomainTakenError, InvalidHostnameError } from "./onboarding-data";
import { currentBusinessId, hasPostgresCode, UNIQUE_VIOLATION } from "./tenant";

/** A staff write across tenants: the plain staff connection, or a transaction opened on it. */
type Runner = Database | ScopedTransaction;

export class DomainNotReadyForDnsError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no approved project with a domain to connect.`);
    this.name = "DomainNotReadyForDnsError";
  }
}

const LIVE_DOMAINS = (businessId: string) => and(eq(domains.businessId, businessId), isNull(domains.removedAt));

export interface ConnectingDomain {
  readonly id: string;
  readonly hostname: string;
  readonly status: DomainStatus;
  /** False for a domain a live customer has asked to move to: their current address stays the main one until it is switched. */
  readonly isPrimary: boolean;
}

/**
 * The domain being connected: a domain a customer has asked to move to if there is one (their current address stays the main
 * address, and keeps working, until it is switched), otherwise the business's main domain. One query, ordered so the
 * not-yet-primary row comes first.
 */
async function findConnectingDomain(tx: Runner, businessId: string): Promise<ConnectingDomain | null> {
  const rows = await tx
    .select({ id: domains.id, hostname: domains.hostname, status: domains.status, isPrimary: domains.isPrimary })
    .from(domains)
    .where(LIVE_DOMAINS(businessId))
    .orderBy(asc(domains.isPrimary))
    .limit(1);
  return rows[0] ?? null;
}

/** The signed-in customer's domain being connected (see findConnectingDomain), read under their own scope. */
export async function getConnectingDomain(tx: ScopedTransaction): Promise<ConnectingDomain | null> {
  return findConnectingDomain(tx, await currentBusinessId(tx));
}

export class DomainSwitchNotReadyError extends Error {
  constructor(businessId: string) {
    super(`Business ${businessId} has no connected domain to switch to.`);
    this.name = "DomainSwitchNotReadyError";
  }
}

/**
 * A customer whose website is already live on a free address asks to move to a domain of their own. The new domain is kept
 * beside the current one, not instead of it: the free address stays the main address and keeps working until staff switch
 * (switchToDomain). An earlier request that was never switched is retired first, so there is only ever one. Runs as the
 * customer (the app role may add a pending domain and retire one); a hostname that is live for another business is refused.
 */
export async function requestDomainMove(
  tx: ScopedTransaction,
  input: { readonly hostname: string; readonly ownerConfirmedAt: Date },
): Promise<ConnectingDomain> {
  const businessId = await currentBusinessId(tx);
  const hostname = input.hostname.trim().toLowerCase();
  if (hostname === "") throw new InvalidHostnameError();

  try {
    return await tx.transaction(async (savepoint) => {
      await savepoint
        .update(domains)
        .set({ removedAt: new Date() })
        .where(and(LIVE_DOMAINS(businessId), eq(domains.isPrimary, false)));
      const rows = await savepoint
        .insert(domains)
        .values({ businessId, hostname, isPrimary: false, status: "pending", ownerConfirmedAt: input.ownerConfirmedAt })
        .returning({ id: domains.id, hostname: domains.hostname, status: domains.status, isPrimary: domains.isPrimary });
      const inserted = rows[0];
      if (inserted === undefined) throw new Error("Domain insert returned no row");
      return inserted;
    });
  } catch (error) {
    if (hasPostgresCode(error, UNIQUE_VIOLATION)) throw new DomainTakenError(hostname);
    throw error;
  }
}

export interface DomainSwitched {
  readonly oldHostname: string;
  readonly newHostname: string;
}

/**
 * Staff move a live customer's website to the domain they connected: the current main domain is retired (kept, with
 * `removed_at`), the connected one becomes the main domain and `active`, and the business's website address follows it. Only a
 * domain whose DNS has been found connected (`verifying`) can be switched to.
 */
export async function switchToDomain(db: Runner, input: { readonly businessId: string }): Promise<DomainSwitched> {
  return db.transaction(async (tx) => {
    const candidate = await findConnectingDomain(tx, input.businessId);
    if (candidate === null || candidate.isPrimary || candidate.status !== "verifying") throw new DomainSwitchNotReadyError(input.businessId);

    const [current] = await tx
      .select({ id: domains.id, hostname: domains.hostname })
      .from(domains)
      .where(and(LIVE_DOMAINS(input.businessId), eq(domains.isPrimary, true)))
      .limit(1);
    if (current !== undefined) {
      await tx.update(domains).set({ isPrimary: false, removedAt: new Date() }).where(eq(domains.id, current.id));
    }
    await tx.update(domains).set({ isPrimary: true, status: "active" }).where(eq(domains.id, candidate.id));
    await setBusinessWebsiteUrl(tx, input.businessId, `https://${candidate.hostname}`);
    return { oldHostname: current?.hostname ?? "", newHostname: candidate.hostname };
  });
}

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
    const domain = await findConnectingDomain(tx, input.businessId);
    if (domain === null || domain.status === "active") throw new DomainNotReadyForDnsError(input.businessId);

    // A first launch needs an approved project; a live customer moving to their own domain needs a live one.
    const [project] = await tx
      .select({ id: projects.id })
      .from(projects)
      .where(and(eq(projects.businessId, input.businessId), eq(projects.status, domain.isPrimary ? "approved" : "live")))
      .limit(1);
    if (project === undefined) throw new DomainNotReadyForDnsError(input.businessId);
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
    const domain = await findConnectingDomain(tx, input.businessId);
    if (domain === null || domain.hostname !== input.hostname || !IN_DNS_STEP.includes(domain.status)) return { becameConnected: false };

    const next: DomainStatus = input.result === "connected" ? "verifying" : input.result === "elsewhere" ? "misconfigured" : "awaiting_dns";
    if (next === domain.status) return { becameConnected: false };

    await tx.update(domains).set({ status: next }).where(and(eq(domains.id, domain.id), inArray(domains.status, [...IN_DNS_STEP])));
    return { becameConnected: next === "verifying" && domain.status !== "verifying" };
  });
}
