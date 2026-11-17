import type { BellCopy, CopyModule } from "./notification-events";

/*
 * The bell's words, one entry per event. The kickoff lines are the approved wording (docs/implementation/AGENT-RULES.md,
 * section 2) and the draft wording of docs/notifications/02-target-matrix.md, section A. An event with no entry here has no
 * wording yet (EVENTS_WITHOUT_WORDING in notification-events.ts); package N5 adds it. No em or en dashes.
 */

/** Where a customer reads about and picks a call time: Help and calls. */
const CUSTOMER_CALLS = "/help";
/** Where staff answer a call: the console's Calls page. */
const STAFF_CALLS = "/calls";

/** The kickoff lines, shared by the email and push modules so the same sentence is worded once. */
export const KICKOFF_LINES = {
  booked: (when: string): string => `Your kickoff call is booked for ${when}`,
  soon: (when: string): string => `Your kickoff call starts at ${when}`,
  completed: "Thanks for the call. We are getting your website started",
  notJoined: (when: string): string => `We missed each other on ${when}. Pick a new time`,
  reschedule: "We need a new time for your kickoff call. Pick one here",
  fallbackStarted: "We started your website",
  ended: (businessName: string): string => `Did the kickoff call with ${businessName} happen?`,
  /** The staff label, as the owner worded it. Customers never see it. */
  fallbackStartedStaff: "Started without call confirmation",
} as const;

export const BELL_COPY: CopyModule<BellCopy> = {
  "kickoff.booked": ({ when }) => ({ title: KICKOFF_LINES.booked(when), link: CUSTOMER_CALLS }),
  "kickoff.soon": ({ when }) => ({ title: KICKOFF_LINES.soon(when), link: CUSTOMER_CALLS }),
  "kickoff.completed": () => ({ title: KICKOFF_LINES.completed, link: "/" }),
  "kickoff.not_joined": ({ when }) => ({ title: KICKOFF_LINES.notJoined(when), link: CUSTOMER_CALLS }),
  "kickoff.reschedule": () => ({ title: KICKOFF_LINES.reschedule, link: CUSTOMER_CALLS }),
  "kickoff.fallback_started": () => ({ title: KICKOFF_LINES.fallbackStarted, link: "/" }),
  "kickoff.ended": ({ businessName }) => ({ title: KICKOFF_LINES.ended(businessName), link: STAFF_CALLS }),
  "kickoff.fallback_started.staff": ({ businessName }) => ({ title: KICKOFF_LINES.fallbackStartedStaff, body: businessName, link: STAFF_CALLS }),
};
