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

export type DomainStepStatus = "done" | "now" | "next";

export interface DomainStep {
  readonly label: string;
  /** What happens at this step, and what the customer does if it is theirs. */
  readonly detail: string;
  readonly status: DomainStepStatus;
}

const LAST_STEPS = [
  { label: "We add it", detail: "We set it up on your website. We email you the moment it is time to connect it." },
  { label: "You connect it", detail: "At your domain company, add the records shown here. It takes a few minutes to a few hours." },
  { label: "You’re live", detail: "Your website opens at your own domain. Your free address forwards to it." },
] as const;

/** A live customer on the free address moves by sending their domain; one who chose their own in setup waits for their preview to be approved. */
const FIRST_STEP = {
  send: { label: "Send your domain", detail: "Tell us the name you own. Your free address keeps working meanwhile." },
  approve: { label: "Approve your preview", detail: "Once you approve your website’s preview, we get your domain ready." },
} as const;

/** The step the customer is on, counting from 0, for a state that is part of getting a domain. NaN when there is no list to show. */
function currentStep(state: DomainPageState): number {
  switch (state) {
    case "free":
    case "own-not-approved":
      return 0;
    case "move-requested":
    case "own-getting-ready":
      return 1;
    case "move-connect":
    case "own-connect":
      return 2;
    case "none":
    case "free-building":
    case "own-live":
      return Number.NaN;
  }
}

/**
 * The four steps of getting a domain of your own, each marked done, now or next, for the list beside the page's task. None
 * while there is nothing to move yet (no address, or a website still being built on the free one) and once the website is live
 * on the domain, when the page says so instead.
 */
export function domainSteps(state: DomainPageState): readonly DomainStep[] | null {
  const current = currentStep(state);
  if (Number.isNaN(current)) return null;
  const first = state === "own-not-approved" || state === "own-getting-ready" || state === "own-connect" ? FIRST_STEP.approve : FIRST_STEP.send;
  return [first, ...LAST_STEPS].map((step, index) => ({ ...step, status: index < current ? "done" : index === current ? "now" : "next" }));
}
