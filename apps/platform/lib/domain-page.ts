import type { DomainStatus, ProjectStatus } from "@fynix/db";

/**
 * What the "Your domain" page shows, from the stored domain, whether the site is live, and the project's status:
 * - `none`: no web address chosen yet.
 * - `free`: on the free temporary address.
 * - `own-not-approved`: their own domain, but the preview isn't approved yet, so nothing to connect.
 * - `own-getting-ready`: approved; staff haven't yet added it to the website's host, so the customer waits (the records stay hidden).
 * - `own-connect`: staff have asked them to connect it: the records and the check.
 * - `own-live`: live on their own domain.
 */
export type DomainPageState = "none" | "free" | "own-not-approved" | "own-getting-ready" | "own-connect" | "own-live";

export interface DomainPageInput {
  readonly domain: { readonly hostname: string; readonly status: DomainStatus } | null;
  readonly isFreeAddress: boolean;
  readonly live: boolean;
  readonly projectStatus: ProjectStatus | null;
}

export function domainPageState(input: DomainPageInput): DomainPageState {
  if (input.domain === null) return "none";
  if (input.isFreeAddress) return "free";
  if (input.live || input.domain.status === "active") return "own-live";
  if (input.domain.status === "awaiting_dns" || input.domain.status === "verifying" || input.domain.status === "misconfigured") return "own-connect";
  return input.projectStatus === "approved" ? "own-getting-ready" : "own-not-approved";
}
