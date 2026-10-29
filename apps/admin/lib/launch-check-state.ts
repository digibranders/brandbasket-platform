import { missingLaunchChecks, type LaunchCheckKey } from "@brandbasket/db";

/** The sentence under the launch checks: how many are still unticked, or that all are ticked. */
export function launchChecksSentence(done: readonly LaunchCheckKey[]): string {
  const left = missingLaunchChecks(done).length;
  if (left === 0) return "All checks are ticked.";
  if (left === 1) return "1 check left before you can go live.";
  return `${left} checks left before you can go live.`;
}
