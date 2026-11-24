import "server-only";
import { formatIstTime, teamsCard } from "@brandbasket/shared/lib/teams-webhook";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { createDefaultNotifier, type Notify } from "@brandbasket/shared/server/notify";
import { getStaffDb } from "./db";
import { serverEnv } from "./env";
import { alertTeams } from "./teams";

export interface CalcomChange {
  readonly what: "booked" | "moved" | "cancelled";
  /** The call's new start, for a booking or a move. */
  readonly startsAt?: Date;
  /** What makes this the same change as an earlier delivery: the delivery's event id. */
  readonly eventId: string;
}

let notifier: Notify | null = null;

function staffNotifier(): Notify {
  notifier ??= createDefaultNotifier(getStaffDb(), {
    onError: (error, context) => console.error("[calcom-alerts] A staff notice could not be sent.", { ...context, ...errorLogInfo(error) }),
  });
  return notifier;
}

/**
 * Tells staff a call changed on Cal.com's side (booked on its own page, or moved or cancelled from its email): a card on the
 * Customers channel and a notice in the console bell. The booking is already stored, so this never throws and never fails
 * the delivery. The event id is the dedupe key for both, so a redelivery that slips past the repeat check still alerts once.
 */
export async function alertCalcomChange(change: CalcomChange): Promise<void> {
  const when = change.startsAt === undefined ? undefined : formatIstTime(change.startsAt);
  try {
    await Promise.all([
      alertTeams(
        "customers",
        teamsCard({
          title: `A call was ${change.what} on Cal.com`,
          facts: [{ name: "Time", value: when }],
          open: { label: "Open calls", url: new URL("/calls", serverEnv().ADMIN_ORIGIN).toString() },
        }),
        { dedupeKey: `calcom:${change.eventId}` },
      ),
      staffNotifier()({ event: "call.changed.staff", audience: { kind: "staff" }, dedupeKey: change.eventId, data: { what: change.what, when } }),
    ]);
  } catch (error) {
    console.error("[calcom-alerts] A call change was saved but staff could not be told.", errorLogInfo(error));
  }
}
