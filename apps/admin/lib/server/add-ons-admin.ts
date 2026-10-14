import "server-only";
import {
  findAddOnSubscription,
  listAddOnSubscriptionsForStaff,
  listPressReleasesForBusiness,
  markAddOnContacted,
  setPressReleaseStatus,
} from "@firstfold/db";
import { logBillingEvent } from "@firstfold/shared/server/billing-log";
import { scheduleAddOnEndFor, type AddOnEndOutcome, type AddOnEndRequest } from "@firstfold/shared/server/add-on-ends";
import {
  clientAddOnRows,
  clientPressReleaseRows,
  type ClientAddOnRow,
  type ClientPressReleaseRow,
  type PressReleaseStatus,
} from "@/lib/client-add-ons";
import { getBillingProvider } from "./billing-provider";
import { getStaffDb } from "./db";

/**
 * Staff work on a client's add-ons: what the client page shows, pausing or cancelling for the customer, marking a
 * purchase as followed up, and moving a press release on. Every function here assumes the caller has already checked
 * the signed-in staff member (requireStaffAccess), as the client page's other server modules do.
 */

export interface ClientAddOns {
  readonly addOns: readonly ClientAddOnRow[];
  readonly pressReleases: readonly ClientPressReleaseRow[];
}

/** Everything the client page's Add-ons section shows for one business. */
export async function loadClientAddOns(businessId: string, now: Date): Promise<ClientAddOns> {
  const db = getStaffDb();
  const [rows, releases] = await Promise.all([listAddOnSubscriptionsForStaff(db, businessId), listPressReleasesForBusiness(db, businessId)]);
  const addOns = clientAddOnRows(rows, now);
  for (const row of addOns) {
    // Ids only: the row holds the customer's price and dates, none of which belong in a log.
    if (row.broken) logBillingEvent("error", "add-on-view-failed", { businessId, addOnSubscriptionId: row.id });
  }
  return { addOns, pressReleases: clientPressReleaseRows(releases) };
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
