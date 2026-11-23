import { EVENT_LINES, KICKOFF_LINES, SOCIAL_LINES } from "./notification-copy-bell";
import type { CopyModule, PushCopy } from "./notification-events";

/*
 * The pushes' words, one entry per event. A push never carries private detail: a short line and the page to open. The tag is
 * the event key, so a repeat replaces the one before it. No em or en dashes.
 */

const CUSTOMER_CALLS = "/help";
const STAFF_CALLS = "/";

export const PUSH_COPY: CopyModule<PushCopy> = {
  "kickoff.soon": ({ when }) => ({ title: KICKOFF_LINES.soon(when), link: CUSTOMER_CALLS, tag: "kickoff.soon" }),
  // The one extra push when a call is still unanswered 2 hours after it ended. Draft wording, awaiting the owner's yes.
  "kickoff.ended.reminder": () => ({ title: "A kickoff call is still waiting for your answer", link: STAFF_CALLS, tag: "kickoff.ended.reminder" }),
  // The business is named in the bell and the email, not here: a lock screen is not private.
  "kickoff.ended": () => ({ title: "Did the kickoff call happen?", link: STAFF_CALLS, tag: "kickoff.ended" }),
  // N5. A push says what happened and opens the page: no amounts, no names, no business. Staff pushes never name a business.
  "billing.payment_failed": () => ({ title: EVENT_LINES.paymentFailed, link: "/billing/payment", tag: "billing.payment_failed" }),
  "website.preview_ready": () => ({ title: EVENT_LINES.previewReady, link: "/website", tag: "website.preview_ready" }),
  "website.live": () => ({ title: EVENT_LINES.live, link: "/website", tag: "website.live" }),
  "request.reply": ({ ticketId, update }) => ({ title: EVENT_LINES.requestUpdate[update], link: `/requests/${ticketId}`, tag: `request.reply.${ticketId}` }),
  "account.monthly_report": ({ month }) => ({ title: EVENT_LINES.monthlyReport, link: `/reports/${month}`, tag: "account.monthly_report" }),
  "request.new.staff": ({ ticketId }) => ({ title: EVENT_LINES.staffNewRequest, link: `/support/${ticketId}`, tag: `request.new.staff.${ticketId}` }),
  "billing.payment_needs_look.staff": () => ({ title: EVENT_LINES.staffPaymentLook, link: "/payments", tag: "billing.payment_needs_look.staff" }),
  "account.security_alert.staff": () => ({ title: EVENT_LINES.staffSystemError, link: "/", tag: "account.security_alert.staff" }),
  // N7. Social: a line and the page, no account or post detail.
  "social.post_failed": () => ({ title: SOCIAL_LINES.postFailed, link: "/social", tag: "social.post_failed" }),
  "social.connection_expiring": ({ daysLeft }) => ({ title: SOCIAL_LINES.connectionExpiring(daysLeft), link: "/social", tag: "social.connection_expiring" }),
  "social.poster_ready": () => ({ title: SOCIAL_LINES.posterReady, link: "/social", tag: "social.poster_ready" }),
  "social.post_held": () => ({ title: SOCIAL_LINES.postHeld, link: "/social", tag: "social.post_held" }),
};
