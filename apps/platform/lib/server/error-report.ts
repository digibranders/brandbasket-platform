import "server-only";
import { createDatabaseErrorReporter, type ServerErrorContext } from "@firstfold/shared/server/error-report";
import { getStaffDb } from "./db";

import { sendSystemErrorAlert } from "./support-alerts";

let reporter: ReturnType<typeof createDatabaseErrorReporter> | undefined;

export async function reportServerError(error: unknown, context: ServerErrorContext): Promise<string | null> {
  try {
    reporter ??= createDatabaseErrorReporter(() => getStaffDb());
    const eventId = await reporter(error, { ...context, release: process.env.NEXT_PUBLIC_FIRSTFOLD_RELEASE });
    if (eventId) {
      void sendSystemErrorAlert({
        app: context.app,
        operation: context.operation,
        errorClass: error instanceof Error ? error.name || "Error" : "UnknownError",
        route: context.route,
        severity: "error",
        release: process.env.NEXT_PUBLIC_FIRSTFOLD_RELEASE,
        eventId,
      }).catch((err) => console.error("[support-alert] Error alert failed", err));
    }
    return eventId;
  } catch { return null; }
}
