import "server-only";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { unstable_rethrow } from "next/navigation";

/**
 * Runs a read that must not break its page: a failure is logged as `[scope] could not read <label>` and the fallback is
 * used. A Next redirect or not-found thrown inside the read is control flow, not a failure, and is passed on.
 */
export async function quietly<T>(scope: string, label: string, fallback: T, work: () => Promise<T>): Promise<T> {
  try {
    return await work();
  } catch (error) {
    unstable_rethrow(error);
    console.error(`[${scope}] could not read ${label}`, errorLogInfo(error));
    return fallback;
  }
}
