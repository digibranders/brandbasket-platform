import { KICKOFF_LINES } from "./notification-copy-bell";
import type { CopyModule, PushCopy } from "./notification-events";

/*
 * The pushes' words, one entry per event. A push never carries private detail: a short line and the page to open. The tag is
 * the event key, so a repeat replaces the one before it. No em or en dashes.
 */

const CUSTOMER_CALLS = "/help";
const STAFF_CALLS = "/";

export const PUSH_COPY: CopyModule<PushCopy> = {
  "kickoff.soon": ({ when }) => ({ title: KICKOFF_LINES.soon(when), link: CUSTOMER_CALLS, tag: "kickoff.soon" }),
  // The business is named in the bell and the email, not here: a lock screen is not private.
  "kickoff.ended": () => ({ title: "Did the kickoff call happen?", link: STAFF_CALLS, tag: "kickoff.ended" }),
};
