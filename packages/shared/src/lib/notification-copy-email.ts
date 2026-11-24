import { EVENT_LINES, KICKOFF_LINES, SOCIAL_LINES } from "./notification-copy-bell";
import type { CopyModule, EmailCopy } from "./notification-events";

/*
 * The emails' words, one entry per event: the subject, the paragraphs and at most one button (its link is a path; notify()
 * makes it absolute). The kickoff emails say the same line as the bell and take their button labels from the line itself.
 * Existing templates (receipt, refund, preview ready and the others in packages/email) keep their own wording until package
 * N5 moves them here. No em or en dashes.
 */

const CUSTOMER_CALLS = "/help";
const STAFF_CALLS = "/";
const SOCIAL = "/social";

export const EMAIL_COPY: CopyModule<EmailCopy> = {
  "kickoff.booked": ({ when }) => ({ subject: KICKOFF_LINES.booked(when), paragraphs: [KICKOFF_LINES.booked(when)] }),
  "kickoff.soon": ({ when }) => ({
    subject: KICKOFF_LINES.soon(when),
    paragraphs: [KICKOFF_LINES.soon(when)],
    button: { label: "Join here", link: CUSTOMER_CALLS },
  }),
  "kickoff.completed": () => ({ subject: KICKOFF_LINES.completed, paragraphs: [KICKOFF_LINES.completed] }),
  "kickoff.not_joined": ({ when }) => ({
    subject: `We missed each other on ${when}`,
    paragraphs: [KICKOFF_LINES.notJoined(when)],
    button: { label: "Pick a new time", link: CUSTOMER_CALLS },
  }),
  "kickoff.reschedule": () => ({
    subject: "We need a new time for your kickoff call",
    paragraphs: [KICKOFF_LINES.reschedule],
    button: { label: "Pick one here", link: CUSTOMER_CALLS },
  }),
  "kickoff.ended": ({ businessName }) => ({
    subject: KICKOFF_LINES.ended(businessName),
    paragraphs: [KICKOFF_LINES.ended(businessName)],
    button: { label: "Open Calls", link: STAFF_CALLS },
  }),
  // N5. Only the events whose email goes through notify(); the others keep their own templates in packages/email.
  "billing.plan_lapsed": () => ({
    subject: EVENT_LINES.planLapsed,
    paragraphs: [`${EVENT_LINES.planLapsed}.`, `${EVENT_LINES.planLapsedBody}.`],
    button: { label: "Pay now", link: "/billing/payment" },
  }),
  "billing.unapplied_payment": () => ({
    subject: EVENT_LINES.unappliedPayment,
    paragraphs: [`${EVENT_LINES.unappliedPayment}.`, `${EVENT_LINES.unappliedPaymentBody}.`],
    button: { label: "Open billing", link: "/billing" },
  }),
  "website.started": () => ({ subject: EVENT_LINES.started, paragraphs: [`${EVENT_LINES.started}.`], button: { label: "See progress", link: "/website" } }),
  "website.approval_received": () => ({ subject: "We received your approval", paragraphs: [`${EVENT_LINES.approvalReceived}.`], button: { label: "Open your website", link: "/website" } }),
  "account.closure": () => ({ subject: EVENT_LINES.closure, paragraphs: [`${EVENT_LINES.closure}.`, `${EVENT_LINES.closureBody}.`] }),
  // N7. Social. The body line of the bell is the second paragraph.
  "social.post_failed": () => ({ subject: SOCIAL_LINES.postFailed, paragraphs: [`${SOCIAL_LINES.postFailed}.`, `${SOCIAL_LINES.postFailedBody}.`], button: { label: "Open Social", link: SOCIAL } }),
  "social.connection_expiring": ({ daysLeft }) => ({
    subject: SOCIAL_LINES.connectionExpiring(daysLeft),
    paragraphs: [`${SOCIAL_LINES.connectionExpiring(daysLeft)}.`, `${SOCIAL_LINES.connectionBody}.`],
    button: { label: "Reconnect", link: SOCIAL },
  }),
  "social.poster_ready": () => ({ subject: SOCIAL_LINES.posterReady, paragraphs: [`${SOCIAL_LINES.posterReady}.`, `${SOCIAL_LINES.posterReadyBody}.`], button: { label: "Check your pictures", link: SOCIAL } }),
  "social.week_lapsed": () => ({ subject: SOCIAL_LINES.weekLapsed, paragraphs: [`${SOCIAL_LINES.weekLapsed}.`, `${SOCIAL_LINES.weekLapsedBody}.`], button: { label: "Open Social", link: SOCIAL } }),
  "social.post_held": () => ({ subject: SOCIAL_LINES.postHeld, paragraphs: [`${SOCIAL_LINES.postHeld}.`, `${SOCIAL_LINES.postHeldBody}.`], button: { label: "Reconnect", link: SOCIAL } }),
  "social.post_missed": () => ({ subject: SOCIAL_LINES.postMissed, paragraphs: [`${SOCIAL_LINES.postMissed}.`, `${SOCIAL_LINES.postMissedBody}.`], button: { label: "Open Social", link: SOCIAL } }),
  "social.poster_expiring": () => ({ subject: SOCIAL_LINES.posterExpiring, paragraphs: [`${SOCIAL_LINES.posterExpiring}.`, `${SOCIAL_LINES.posterExpiringBody}.`], button: { label: "Check your pictures", link: SOCIAL } }),
};
