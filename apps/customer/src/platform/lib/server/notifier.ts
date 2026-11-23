import "server-only";
import { createDefaultNotifier, type Notify } from "@brandbasket/shared/server/notify";
import { reportError } from "@/lib/report";
import { getStaffDb } from "./db";

let notifier: Notify | null = null;

/**
 * notify() for this app's server code (timers, webhooks, server actions). Built on first use, since it needs the origins in the
 * environment. A failed delivery is reported to Sentry by area; notify() itself never throws, so callers only look at the
 * result if they need to.
 */
export const notify: Notify = (input) => {
  notifier ??= createDefaultNotifier(getStaffDb(), {
    onError: (error, context) => {
      reportError(error, { area: `notify.${context.step}` });
    },
  });
  return notifier(input);
};
