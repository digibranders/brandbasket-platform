import type { DomainStatus, ProjectStatus } from "@brandbasket/db";

/** The 14 states of a website build that the Website tab tells apart. The database status stays the source of truth. */
export type WebsiteStage =
  | "waiting"
  | "unconfirmed"
  | "ready"
  | "building"
  | "building_late"
  | "review"
  | "review_silent"
  | "changes"
  | "approved"
  | "address_error"
  | "live"
  | "move"
  | "hold"
  | "cancelled";

export const WEBSITE_STEPS = [
  { id: "kickoff", label: "Kickoff" },
  { id: "build", label: "Build" },
  { id: "preview", label: "Preview" },
  { id: "launch", label: "Launch" },
  { id: "live", label: "Live" },
] as const;

export interface WebsiteStageFacts {
  readonly status: ProjectStatus;
  /** The kickoff call ended and nobody confirmed it. */
  readonly kickoffUnconfirmed: boolean;
  /** A promised preview we owe is past its date. */
  readonly late: boolean;
  /** Whole days since the preview was sent with no answer, or null. */
  readonly silentDays: number | null;
  /** Days of silence from which the customer may need a nudge (ruling 15). */
  readonly silentThreshold: number;
  readonly domainStatus: DomainStatus | null;
  /** A live customer asked to move to their own domain. */
  readonly moveAsked: boolean;
}

export function websiteStage(facts: WebsiteStageFacts): WebsiteStage {
  switch (facts.status) {
    case "onboarding":
      return facts.kickoffUnconfirmed ? "unconfirmed" : "waiting";
    case "submitted":
      return "ready";
    case "building":
      return facts.late ? "building_late" : "building";
    case "preview":
      return facts.silentDays !== null && facts.silentDays >= facts.silentThreshold ? "review_silent" : "review";
    case "revisions":
      return "changes";
    case "approved":
      return facts.domainStatus === "misconfigured" || facts.domainStatus === "degraded" ? "address_error" : "approved";
    case "live":
      return facts.moveAsked ? "move" : "live";
    case "on_hold":
      return "hold";
    case "cancelled":
      return "cancelled";
  }
}

/**
 * Where the stepper stands: the 0-based index of the current step, the number of steps when every step is done, or null when
 * no step is current (on hold or cancelled: the real step is not recorded, so none is claimed).
 */
export function stepperIndex(stage: WebsiteStage): number | null {
  switch (stage) {
    case "waiting":
    case "unconfirmed":
      return 0;
    case "ready":
    case "building":
    case "building_late":
      return 1;
    case "review":
    case "review_silent":
    case "changes":
      return 2;
    case "approved":
    case "address_error":
      return 3;
    case "live":
    case "move":
      return WEBSITE_STEPS.length;
    case "hold":
    case "cancelled":
      return null;
  }
}

/** Whole days between a preview being sent and now, or null when none was sent. */
export function silentDaysSince(sentAt: Date | null, now: Date): number | null {
  if (sentAt === null) return null;
  return Math.max(0, Math.floor((now.getTime() - sentAt.getTime()) / 86_400_000));
}
