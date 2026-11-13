import "server-only";
import {
  countNewEnquiries,
  getNotificationsSeenAt,
  listActivityEvents,
  listRequestNeeds,
  listSentReports,
  listUnreadReplies,
  listWaitingOnYou,
  withTenantScope,
  type ScopedTransaction,
} from "@brandbasket/db";
import { cache } from "react";
import { getAppDb } from "@/lib/db";
import type { CustomerContext, Service } from "@/lib/guards";
import { load, type Loaded } from "@/lib/loaded";
import { bellView, billingBannerState, requestsWaiting, type BellView, type BillingBannerState } from "./rules";

/** How many lines of work the bell lists. */
const BELL_ACTIVITY = 10;
/** How many unread replies the bell lists (listUnreadReplies allows 1 to 20). */
const BELL_REPLIES = 5;

/** Everything the shell draws, read once per request. Plain data, so the client shell can take it as props. */
export interface ShellView {
  readonly business: {
    readonly name: string;
    /** The services on the plan, in catalogue order. */
    readonly services: readonly Service[];
  };
  readonly person: {
    readonly name: string;
    /** The email, or the phone number for an account that signs in with one (its email is only a placeholder). */
    readonly contact: string;
    readonly role: CustomerContext["role"];
  };
  /** New enquiries. */
  readonly enquiries: Loaded<number>;
  /** Requests waiting on the customer, one per conversation. */
  readonly requests: Loaded<number>;
  /** Whether a report has been sent. Read on its own: when it fails, the Reports link stays. */
  readonly reports: Loaded<boolean>;
  readonly banner: BillingBannerState;
  readonly notifications: Loaded<BellView>;
}

/**
 * The shell's view model. Each read is its own `load()`, so one failure costs only its own number or panel: a link is never
 * hidden because a read failed (apps/platform hid Social and Search when the services read failed).
 */
export const loadShell = cache(async (customer: CustomerContext): Promise<ShellView> => {
  const { tenant, user, businessId } = customer;
  const db = getAppDb();
  const scoped = <T>(work: (tx: ScopedTransaction) => Promise<T>): Promise<T> => withTenantScope(db, tenant, work);

  const [enquiries, requests, reports, notifications] = await Promise.all([
    load("shell.enquiries", () => scoped((tx) => countNewEnquiries(tx))),
    load("shell.requests", () =>
      scoped(async (tx) => requestsWaiting(await listRequestNeeds(tx, user.id, businessId), await listWaitingOnYou(tx, user.id, businessId))),
    ),
    // shortcut: reads every sent report to learn if there is one; add a limit-1 query in the db package when a business holds hundreds.
    load("shell.reports", () => scoped(async (tx) => (await listSentReports(tx, businessId)).length > 0)),
    load("shell.notifications", () =>
      scoped(async (tx) =>
        bellView({
          needs: await listRequestNeeds(tx, user.id, businessId),
          waiting: await listWaitingOnYou(tx, user.id, businessId),
          replies: await listUnreadReplies(tx, user.id, businessId, BELL_REPLIES),
          activity: (await listActivityEvents(tx, businessId, BELL_ACTIVITY)).map((event) => ({
            id: event.id,
            title: event.title,
            service: event.service,
            occurredAt: event.occurredAt,
          })),
          seenAt: await getNotificationsSeenAt(tx, user.id),
        }),
      ),
    ),
  ]);

  return {
    business: { name: customer.businessName, services: customer.services },
    person: { name: user.name, contact: user.phone ?? user.email, role: customer.role },
    enquiries,
    requests,
    reports,
    banner: billingBannerState(customer.billing),
    notifications,
  };
});
