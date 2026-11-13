import "server-only";
import { findNominee, listNotificationPreferences, withTenantScope, type Nominee } from "@brandbasket/db";
import { displayPhone } from "@brandbasket/shared/server/phone-display";
import { getAppDb } from "@/lib/db";
import type { CustomerContext } from "@/lib/guards";
import { notificationRows, type NotificationRow } from "./rules/notifications";
import { planEndsAt } from "./rules/account-exit-rules";
import { hasRunningAddOnsFor, loadPackageEndsFor } from "./server/account-exit";

/** The person's email choices for their business, one row per topic. Through row-level security as the signed-in person. */
export async function loadNotificationRows(customer: Pick<CustomerContext, "tenant" | "user">): Promise<readonly NotificationRow[]> {
  const choices = await withTenantScope(getAppDb(), customer.tenant, (tx) => listNotificationPreferences(tx, customer.user.id));
  return notificationRows(choices);
}

export interface NomineeView {
  readonly name: string;
  /** The number as it is read on screen. */
  readonly phoneText: string;
}

function nomineeView(nominee: Nominee | null): NomineeView | null {
  return nominee === null ? null : { name: nominee.name, phoneText: displayPhone(nominee.phone).text };
}

/** The nominee the signed-in person has named, or null. Read under their own scope. */
export async function loadNominee(customer: Pick<CustomerContext, "user">): Promise<NomineeView | null> {
  return nomineeView(await findNominee(getAppDb(), customer.user.id));
}

export interface DeleteFacts {
  /** When the paid plan ends (an ISO date), or null when there is no plan to end. */
  readonly planEndsAt: string | null;
  /** The business has an add-on running, which stops with the month it has paid for. */
  readonly addOnsRunning: boolean;
  /** What cancelling ends for a business that holds a package; empty when there is no package. */
  readonly packageEnds: readonly string[];
}

/** What the Delete account page lists before the customer confirms. */
export async function loadDeleteFacts(customer: Pick<CustomerContext, "user" | "tenant" | "billing">): Promise<DeleteFacts> {
  const [addOnsRunning, packageEnds] = await Promise.all([hasRunningAddOnsFor(customer), loadPackageEndsFor(customer)]);
  return { planEndsAt: planEndsAt(customer.billing.subscription, new Date())?.toISOString() ?? null, addOnsRunning, packageEnds };
}
