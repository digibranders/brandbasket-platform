import "server-only";
import {
  findAddOnSubscription,
  findBusinessCurrency,
  findChargeForBusiness,
  findLatestSubscriptionForBusiness,
  findPackageOfferForfeitedAt,
  listAddOnSubscriptionsForStaff,
  listBundledAddOnsForBusiness,
  listPressReleasesForBusiness,
  markAddOnContacted,
  markBundledAddOnContacted,
  setPressReleaseStatus,
} from "@brandbasket/db";
import { logBillingEvent } from "@brandbasket/shared/server/billing-log";
import { scheduleAddOnEndFor, type AddOnEndOutcome, type AddOnEndRequest } from "@brandbasket/shared/server/add-on-ends";
import {
  findKeptPlanStart,
  moveBasketAtProvider,
  readAddOnAssessment,
  removeBundledAddOn,
  startAddOn,
  type AddOnStart,
  type BasketMove,
  type BundledRemoval,
} from "@brandbasket/shared/server/basket-change";
import { MONTHLY_ADD_ON_IDS, type MonthlyAddOnId } from "@brandbasket/shared/lib/billing/add-ons";
import { clientPackageFacts, type ClientPackageFacts } from "@/lib/client-package";
import {
  clientAddOnOption,
  clientAddOnRows,
  clientBundledAddOnRows,
  keptStartsOnText,
  type ClientAddOnOption,
  clientPressReleaseRows,
  type ClientAddOnRow,
  type ClientBundledAddOnRow,
  type ClientPressReleaseRow,
  type PressReleaseStatus,
} from "@/lib/client-add-ons";
import { basketDeps } from "./basket-deps";
import { getBillingProvider } from "./billing-provider";
import { getStaffDb } from "./db";

/**
 * Staff work on a client's add-ons: what the client page shows, pausing or cancelling for the customer, marking a
 * purchase as followed up, and moving a press release on. Every function here assumes the caller has already checked
 * the signed-in staff member (requireStaffAccess), as the client page's other server modules do.
 */

export interface ClientAddOns {
  readonly addOns: readonly ClientAddOnRow[];
  readonly bundledAddOns: readonly ClientBundledAddOnRow[];
  readonly pressReleases: readonly ClientPressReleaseRow[];
  /** What staff can add (or keep) for the client now. */
  readonly options: readonly ClientAddOnOption[];
  /** The package the client has, its ad credit and when the offer was given up. */
  readonly package: ClientPackageFacts;
  /** The day the client's kept plan starts, when one is waiting: services change after it. */
  readonly keptStartsOn: string | null;
}

/** Everything the client page's Add-ons section shows for one business. */
export async function loadClientAddOns(businessId: string, now: Date): Promise<ClientAddOns> {
  const db = getStaffDb();
  const [rows, releases, bundled, currency, forfeitedAt] = await Promise.all([
    listAddOnSubscriptionsForStaff(db, businessId),
    listPressReleasesForBusiness(db, businessId),
    listBundledAddOnsForBusiness(db, businessId),
    findBusinessCurrency(db, businessId),
    findPackageOfferForfeitedAt(db, businessId),
  ]);
  if (currency === null) throw new Error(`No business with id ${businessId} to list add-ons for`);
  const addOns = clientAddOnRows(rows, now);
  for (const row of addOns) {
    // Ids only: the row holds the customer's price and dates, none of which belong in a log.
    if (row.broken) logBillingEvent("error", "add-on-view-failed", { businessId, addOnSubscriptionId: row.id });
  }
  const subscription = await findLatestSubscriptionForBusiness(db, businessId);
  const keptStartsOn = await findKeptPlanStart(db, subscription);
  const openChargeCents = new Map<string, number>();
  for (const row of bundled) {
    if (row.status !== "pending" || row.chargeId === null) continue;
    const charge = await findChargeForBusiness(db, businessId, row.chargeId);
    if (charge?.status === "open") openChargeCents.set(charge.id, charge.amountCents);
  }
  const providerName = getBillingProvider().name;
  const options: ClientAddOnOption[] = [];
  for (const addOn of MONTHLY_ADD_ON_IDS) {
    const option = clientAddOnOption(addOn, await readAddOnAssessment(db, { businessId, addOn, providerName, now }), currency);
    if (option !== null) options.push(option);
  }
  return {
    addOns,
    bundledAddOns: clientBundledAddOnRows(bundled, currency, {
      nextBillingOn: subscription?.paidThroughAt ?? null,
      openChargeCents,
      cancelRequested: subscription?.cancelRequestedAt != null,
      keptStartsOn,
    }),
    pressReleases: clientPressReleaseRows(releases),
    options,
    package: clientPackageFacts({ lines: bundled, subscription, currency, forfeitedAt }),
    keptStartsOn: keptStartsOnText(keptStartsOn),
  };
}

/**
 * Adds an add-on for the client, or keeps one that is ending: the same rules and price as the customer's own Add
 * (startAddOn). An add opens a charge the customer pays from Billing; the staff member is recorded on the add-on.
 */
export async function addClientAddOn(input: { readonly businessId: string; readonly addOn: MonthlyAddOnId; readonly staffUserId: string }, now: Date): Promise<AddOnStart> {
  return startAddOn(basketDeps(), { businessId: input.businessId, addOn: input.addOn, staffId: input.staffUserId, now });
}

/** Takes an add-on out of the client's plan payment from the next billing date, as the customer's own Remove does. */
export async function removeClientAddOn(input: { readonly businessId: string; readonly addOn: MonthlyAddOnId }, now: Date): Promise<BundledRemoval> {
  return removeBundledAddOn(basketDeps(), { businessId: input.businessId, addOn: input.addOn, now });
}

/** Tells the provider again to bill the client's added add-ons from the next renewal, after it refused the first time. */
export async function retryClientAddOnProvider(input: { readonly businessId: string; readonly bundledAddOnId: string }, now: Date): Promise<BasketMove> {
  const row = (await listBundledAddOnsForBusiness(getStaffDb(), input.businessId)).find((candidate) => candidate.id === input.bundledAddOnId);
  if (row === undefined) return { kind: "nothing" };
  return moveBasketAtProvider(basketDeps(), row.subscriptionId, now);
}

/**
 * Pauses or cancels an add-on for the customer, with the same rules and the same next-billing-date timing as the customer's
 * own button (scheduleAddOnEndFor is the one function both call). The staff member is recorded on the row. The result says
 * what happened or why nothing did; it throws only for a database failure.
 */
export async function endClientAddOn(request: AddOnEndRequest & { readonly staffUserId: string }, now: Date): Promise<AddOnEndOutcome> {
  return scheduleAddOnEndFor(getStaffDb(), getBillingProvider(), request, now);
}

export type MarkContactedOutcome = "marked" | "already" | "not-found";

/**
 * Records that the team has been in touch about a purchase, which takes it off the Journey's list. Safe to repeat: a
 * second mark changes nothing and keeps the first one's time and author. The purchase must be a paid add-on of this
 * business, so a form carrying another business's id finds nothing.
 */
export async function markClientAddOnContacted(
  input: { readonly businessId: string; readonly addOnSubscriptionId: string; readonly staffUserId: string },
  now: Date,
): Promise<MarkContactedOutcome> {
  const db = getStaffDb();
  const row = await findAddOnSubscription(db, input.businessId, input.addOnSubscriptionId);
  if (row === null || row.activatedAt === null) return "not-found";
  const marked = await markAddOnContacted(db, { id: row.id, staffUserId: input.staffUserId, now });
  return marked ? "marked" : "already";
}

/** Records that the team has been in touch about an add-on taken with the plan. Safe to repeat, and only for this business's own. */
export async function markClientBundledAddOnContacted(
  input: { readonly businessId: string; readonly bundledAddOnId: string; readonly staffUserId: string },
  now: Date,
): Promise<MarkContactedOutcome> {
  const db = getStaffDb();
  const row = (await listBundledAddOnsForBusiness(db, input.businessId)).find((candidate) => candidate.id === input.bundledAddOnId);
  if (row === undefined || row.activatedAt === null) return "not-found";
  const marked = await markBundledAddOnContacted(db, { id: row.id, businessId: input.businessId, staffUserId: input.staffUserId, now });
  return marked ? "marked" : "already";
}

export type PressReleaseStatusOutcome = "changed" | "unchanged" | "not-found";

/**
 * Moves one of the client's press releases on to in progress or published. It never moves backward: a form left open
 * while someone else moved the release on changes nothing and reports `unchanged`. The release must be this business's.
 */
export async function setClientPressReleaseStatus(
  input: {
    readonly businessId: string;
    readonly pressReleaseId: string;
    readonly status: Exclude<PressReleaseStatus, "waiting">;
    readonly staffUserId: string;
  },
  now: Date,
): Promise<PressReleaseStatusOutcome> {
  const db = getStaffDb();
  const releases = await listPressReleasesForBusiness(db, input.businessId);
  if (!releases.some((release) => release.id === input.pressReleaseId)) return "not-found";
  const changed = await setPressReleaseStatus(db, { id: input.pressReleaseId, status: input.status, staffUserId: input.staffUserId, now });
  return changed ? "changed" : "unchanged";
}
