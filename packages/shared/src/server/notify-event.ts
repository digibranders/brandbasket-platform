import type { Database } from "@brandbasket/db";
import type { NotificationEventKey } from "../lib/notification-events";
import { createDefaultNotifier, type NotifyInput } from "./notify";

/*
 * The call every trigger makes: build the default notifier for this request and send one event. It never throws, because the
 * change that caused the notice has already happened and a failed bell must not undo it (notify() itself never throws either;
 * this also covers building the notifier, which throws when an origin is not configured).
 *
 * The customer app does not require ADMIN_ORIGIN, and the console does not need the customer's for a staff notice, so the origin
 * an event does not use falls back to the other one. A staff event with no ADMIN_ORIGIN is skipped and logged: its link would point at the wrong app.
 */
export async function notifyEvent<K extends NotificationEventKey>(db: Database, input: NotifyInput<K>, env: Readonly<Record<string, string | undefined>> = process.env): Promise<void> {
  try {
    const appOrigin = env.APP_ORIGIN?.trim() || undefined;
    const adminOrigin = env.ADMIN_ORIGIN?.trim() || undefined;
    if (input.audience.kind === "staff" && adminOrigin === undefined) throw new Error("ADMIN_ORIGIN is not set, so a notice for staff has no page to link to.");
    const notify = createDefaultNotifier(db, {
      env: { ...env, APP_ORIGIN: appOrigin ?? adminOrigin, ADMIN_ORIGIN: adminOrigin ?? appOrigin },
      onError: (error, context) => console.error("[notify] a notice step failed", { event: context.event, step: context.step, error: error instanceof Error ? error.name : "error" }),
    });
    await notify(input);
  } catch (error) {
    console.error("[notify] a notice could not be sent", { event: input.event, error: error instanceof Error ? error.name : "error" });
  }
}
