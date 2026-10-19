import "server-only";
import { CHECK_VIOLATION, hasPostgresCode } from "@brandbasket/db";
import { unstable_rethrow } from "next/navigation";
import { reportServerError } from "./error-report";

/** Call after feature-specific expected errors have already been handled. Never send form values. */
export async function reportUnexpectedPanelError(error: unknown, route: string, userId: string): Promise<void> {
  unstable_rethrow(error);
  if (hasPostgresCode(error, CHECK_VIOLATION)) return;
  await reportServerError(error, { app: "platform", operation: "server_action", route, userId });
}
