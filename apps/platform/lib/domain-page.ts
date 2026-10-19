import type { DomainStatus, ProjectStatus } from "@brandbasket/db";

/**
 * What the "Your domain" page shows, from the stored domain, the domain the customer has asked to move to (if any), whether
 * the site is live, and the project's status:
 * - `none`: no web address chosen yet.
 * - `free-building`: on the free address and the site isn't live yet: they choose their own domain in setup.
 * - `free`: live on the free address: the form to ask for a domain of their own.
 * - `move-requested`: they've asked; staff are adding it to the website's host.
 * - `move-connect`: staff asked them to connect it: the records and the check (or "connected" once found).
 * - `own-not-approved`: their own domain, but the preview isn't approved yet, so nothing to connect.
 * - `own-getting-ready`: approved; staff haven't yet added it to the website's host (the records stay hidden).
 * - `own-connect`: staff have asked them to connect it: the records and the check.
 * - `own-live`: live on their own domain.
 */
export type DomainPageState =
  | "none"
  | "free-building"
  | "free"
  | "move-requested"
  | "move-connect"
  | "own-not-approved"
  | "own-getting-ready"
  | "own-connect"
  | "own-live";

export interface DomainPageInput {
  readonly domain: { readonly hostname: string; readonly status: DomainStatus } | null;
  /** A domain a live customer asked to move to, kept beside their main address until staff switch to it. */
  readonly moving: { readonly hostname: string; readonly status: DomainStatus } | null;
  readonly isFreeAddress: boolean;
  readonly live: boolean;
  readonly projectStatus: ProjectStatus | null;
}

const IN_DNS_STEP: readonly DomainStatus[] = ["awaiting_dns", "verifying", "misconfigured"];

export function domainPageState(input: DomainPageInput): DomainPageState {
  if (input.domain === null) return "none";
  if (input.isFreeAddress) {
    if (!input.live) return "free-building";
    if (input.moving === null) return "free";
    return IN_DNS_STEP.includes(input.moving.status) ? "move-connect" : "move-requested";
  }
  if (input.live || input.domain.status === "active") return "own-live";
  if (IN_DNS_STEP.includes(input.domain.status)) return "own-connect";
  return input.projectStatus === "approved" ? "own-getting-ready" : "own-not-approved";
}

/** The four steps of moving a live site to a domain of its own, for the strip at the top of the page. */
export const MOVE_STEPS = ["Send your domain", "We add it", "You connect it", "You’re live"] as const;

/** Which step is current, counting from 0, for a state that is part of the move. */
export function moveStepIndex(state: DomainPageState): number {
  switch (state) {
    case "move-requested":
      return 1;
    case "move-connect":
    case "own-connect":
      return 2;
    case "own-live":
      return 3;
    default:
      return 0;
  }
}
