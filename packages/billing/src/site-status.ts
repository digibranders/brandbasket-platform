import type { ProjectStatus } from "@firstfold/db";
import { hasBillingAccess, type BillingAccessInput } from "./access";

export interface SiteStatusInput {
  readonly projectStatus: ProjectStatus;
  readonly subscription: BillingAccessInput | null;
}

/**
 * `not_launched` covers every status except `live`. Per the project state machine (spec §5.3), `live` has no
 * outgoing transition — a project that reaches it stays `live` forever, and every OTHER status (including
 * `on_hold`, which only pauses `submitted`/`building`/`revisions`, and `cancelled`, reachable only from "any
 * pre-`live`" status) is definitionally a project that has never had a live website. So there is no website worth
 * reporting on for any of them, whatever billing looks like — a stalled, paused or cancelled-before-launch business
 * never shows as a misleading "offline" site. Once `live`, status is computed from `hasBillingAccess` — see this
 * plan's "Deliberately deferred": there is no worker yet setting a `suspended_at` column, so this is the interim
 * source of truth (computed live on every read), not a cached one.
 */
export type SiteStatus =
  | { readonly kind: "not_launched" }
  | { readonly kind: "online" }
  | { readonly kind: "offline"; readonly reason: "payment_lapsed" };

export function deriveSiteStatus(input: SiteStatusInput, now: Date): SiteStatus {
  if (input.projectStatus !== "live") return { kind: "not_launched" };
  return hasBillingAccess(input.subscription, now) ? { kind: "online" } : { kind: "offline", reason: "payment_lapsed" };
}
