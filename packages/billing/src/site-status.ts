import type { ProjectStatus } from "@brandbasket/db";

export interface SiteStatusInput {
  readonly projectStatus: ProjectStatus;
  /** hasWebsiteService: billing access and a Managed Website line. */
  readonly hasWebsite: boolean;
}

/**
 * `not_launched` covers every status except `live`. Per the project state machine (spec §5.3), `live` has no
 * outgoing transition — a project that reaches it stays `live` forever, and every OTHER status (including
 * `on_hold`, which only pauses `submitted`/`building`/`revisions`, and `cancelled`, reachable only from "any
 * pre-`live`" status) is definitionally a project that has never had a live website. So there is no website worth
 * reporting on for any of them, whatever billing looks like — a stalled, paused or cancelled-before-launch business
 * never shows as a misleading "offline" site. Once `live`, status follows `hasWebsite` (billing access and a Managed Website
 * line; a business without one is reported offline under the same reason). See this plan's "Deliberately deferred": there
 * is no worker yet setting a `suspended_at` column, so this is the interim source of truth (computed live on every read),
 * not a cached one.
 */
export type SiteStatus =
  | { readonly kind: "not_launched" }
  | { readonly kind: "online" }
  | { readonly kind: "offline"; readonly reason: "payment_lapsed" };

export function deriveSiteStatus(input: SiteStatusInput): SiteStatus {
  if (input.projectStatus !== "live") return { kind: "not_launched" };
  return input.hasWebsite ? { kind: "online" } : { kind: "offline", reason: "payment_lapsed" };
}
