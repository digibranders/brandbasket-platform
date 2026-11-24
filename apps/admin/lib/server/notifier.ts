import "server-only";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { createDefaultNotifier, type Notify } from "@brandbasket/shared/server/notify";
import { getStaffDb } from "./db";

let notifier: Notify | null = null;

/**
 * notify() for the console's server code. Built on first use, since it needs both origins in the environment. A failed delivery
 * is logged with its step only (never the raw error); notify() itself never throws.
 */
export const notify: Notify = (input) => {
  notifier ??= createDefaultNotifier(getStaffDb(), {
    onError: (error, context) => console.error("[notify] a notice could not be delivered", { event: context.event, step: context.step, ...errorLogInfo(error) }),
  });
  return notifier(input);
};
