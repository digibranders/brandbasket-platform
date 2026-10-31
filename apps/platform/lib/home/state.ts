import type { ProjectStatus } from "@brandbasket/db";
import type { ServiceKey } from "@/lib/first-look";

/*
 * What the customer's Home says, worked out from facts the backend already holds (docs/redesign-29-oct-2026/
 * implementation-plan.md, section 6). A presentation model, not a database state: the project's own statuses are not
 * renamed or added to. Pure and browser-safe, so every branch is tested and the page only draws what it is told.
 */

/** How long after launch Home greets a new site before it becomes the ongoing page. */
export const LAUNCH_GREETING_DAYS = 7;

export interface HomeFacts {
  readonly now: Date;
  readonly billing: {
    readonly status: "unpaid" | "paid" | "lapsed";
    readonly paymentUnderReview: boolean;
  };
  /** The services the plan pays for now. */
  readonly services: readonly ServiceKey[];
  /** The kickoff booking, or null when none was made. Times are null when the booking page did not report them. */
  readonly kickoff: { readonly startsAt: Date | null; readonly endsAt: Date | null; readonly heldAt: Date | null } | null;
  /** The newest open project, or null when there is none (a plan without the website, or after launch). */
  readonly project: { readonly status: ProjectStatus; readonly slaDueAt: Date | null; readonly onHoldReason: string | null } | null;
  /** The live website, or null before launch. */
  readonly live: { readonly hostname: string; readonly launchedAt: Date | null } | null;
}

export type ClientHomeState =
  | { readonly kind: "payment_required" }
  | { readonly kind: "payment_processing" }
  | { readonly kind: "lapsed" }
  | { readonly kind: "kickoff_unbooked" }
  | { readonly kind: "kickoff_booked"; readonly startsAt: Date | null; readonly endsAt: Date | null }
  /** The kickoff is over and the website build is about to start (the project is still waiting in onboarding). */
  | { readonly kind: "starting" }
  /** Sent to us and not started yet: staff have not pressed Start. Drawn exactly as building, with its own headline. */
  | { readonly kind: "preparing"; readonly dueAt: Date | null }
  | { readonly kind: "building"; readonly dueAt: Date | null }
  | { readonly kind: "on_hold"; readonly reason: string | null }
  | { readonly kind: "preview_ready" }
  | { readonly kind: "revisions" }
  | { readonly kind: "approved" }
  | { readonly kind: "launched"; readonly hostname: string }
  | { readonly kind: "ongoing" };

/** The four layouts Home is drawn in: the many states do not each get a composition of their own. */
export type HomeLayout = "kickoff" | "progress" | "review" | "ongoing" | "billing";

/** A kickoff is over once staff marked it held, or its end time has passed. */
export function kickoffIsOver(kickoff: HomeFacts["kickoff"], now: Date): boolean {
  if (kickoff === null) return false;
  return kickoff.heldAt !== null || (kickoff.endsAt !== null && kickoff.endsAt.getTime() <= now.getTime());
}

export function deriveClientHomeState(facts: HomeFacts): ClientHomeState {
  const { now, billing, kickoff, project, live } = facts;
  if (billing.status === "unpaid") return billing.paymentUnderReview ? { kind: "payment_processing" } : { kind: "payment_required" };
  if (billing.status === "lapsed") return { kind: "lapsed" };

  if (!kickoffIsOver(kickoff, now)) {
    if (kickoff === null || (kickoff.startsAt === null && kickoff.endsAt === null)) {
      // A booking the booking page gave no time for is still a booking: say so rather than ask again.
      return kickoff === null ? { kind: "kickoff_unbooked" } : { kind: "kickoff_booked", startsAt: null, endsAt: null };
    }
    return { kind: "kickoff_booked", startsAt: kickoff.startsAt, endsAt: kickoff.endsAt };
  }

  if (!facts.services.includes("website")) return { kind: "ongoing" };
  if (live !== null) {
    const launchedMs = live.launchedAt?.getTime() ?? null;
    const fresh = launchedMs !== null && now.getTime() - launchedMs < LAUNCH_GREETING_DAYS * 86_400_000;
    return fresh ? { kind: "launched", hostname: live.hostname } : { kind: "ongoing" };
  }
  switch (project?.status) {
    case "onboarding":
      return { kind: "starting" };
    case "submitted":
      return { kind: "preparing", dueAt: project.slaDueAt };
    case "building":
      return { kind: "building", dueAt: project.slaDueAt };
    case "on_hold":
      return { kind: "on_hold", reason: project.onHoldReason };
    case "preview":
      return { kind: "preview_ready" };
    case "revisions":
      return { kind: "revisions" };
    case "approved":
      return { kind: "approved" };
    default:
      return { kind: "ongoing" };
  }
}

export function homeLayoutOf(state: ClientHomeState): HomeLayout {
  switch (state.kind) {
    case "payment_required":
    case "payment_processing":
    case "lapsed":
      return "billing";
    case "kickoff_unbooked":
    case "kickoff_booked":
      return "kickoff";
    case "starting":
    case "preparing":
    case "building":
    case "on_hold":
    case "revisions":
    case "approved":
      return "progress";
    case "preview_ready":
      return "review";
    case "launched":
    case "ongoing":
      return "ongoing";
  }
}
