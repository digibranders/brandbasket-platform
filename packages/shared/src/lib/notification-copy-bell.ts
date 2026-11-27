import type { BellCopy, CopyModule, RequestUpdate } from "./notification-events";

/*
 * The bell's words, one entry per event. The kickoff lines are the approved wording (docs/implementation/AGENT-RULES.md,
 * section 2) and the draft wording of docs/notifications/02-target-matrix.md, section A. An event with no entry here has no
 * wording yet (EVENTS_WITHOUT_WORDING in notification-events.ts); package N5 adds it. No em or en dashes.
 */

/** Where a customer reads about and picks a call time: Help and calls. */
const CUSTOMER_CALLS = "/help";
/** Where staff answer a call: the console's Calls page. */
const STAFF_CALLS = "/";

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

/** The N5 lines (money, website, requests, account), shared by the email and push modules so a sentence is worded once. Draft wording, awaiting the owner's yes. */
export const EVENT_LINES = {
  paymentReceived: "We received your payment",
  paymentFailed: "Your payment did not go through",
  paymentFailedBody: "Pay again to keep your plan running",
  renewalUpcoming: (when: string): string => `Your next payment is due on ${when}`,
  planLapsed: "Your plan has lapsed",
  balanceDue: "Your website is ready. Pay the balance to go live",
  planLapsedBody: "Pay to start it again",
  refund: "Your payment was refunded",
  unappliedPayment: "We received a payment we could not apply to your plan yet",
  unappliedPaymentBody: "Our team is looking at it. You do not need to pay again",
  started: "We have started building your website",
  previewReady: "Your website preview is ready to check",
  changesSent: "We received your changes",
  approvalReceived: "We received your approval. We are getting your website ready to go live",
  live: "Your website is live",
  domainReady: "Your domain is ready to connect",
  domainMoved: "Your website is now on your own domain",
  requestReceived: "We received your request",
  requestUpdate: {
    reply: "We replied to your request",
    quote: "Your request has a quote",
    ready: "Your request is ready to check",
    done: "Your request is done",
  } satisfies Record<RequestUpdate, string>,
  monthlyReport: "Your monthly report is ready",
  closure: "Your account is closed",
  closureBody: "You can restore it until it is erased. Sign in to see how",
  staffNewRequest: "A new request or reply is waiting",
  staffPaymentLook: "A payment needs a look",
  staffSystemError: "A system error needs a look",
} as const;

/** The social lines (N7), shared by the email and push modules. Draft wording, awaiting the owner's yes; the last four events are new beyond the matrix. */
export const SOCIAL_LINES = {
  postFailed: "A post could not be published",
  postFailedBody: "Open Social to see what went wrong",
  connectionExpiring: (daysLeft: number): string =>
    daysLeft <= 0 ? "Your social account connection has expired" : `Your social account connection expires in ${daysLeft} ${daysLeft === 1 ? "day" : "days"}`,
  connectionBody: "Reconnect it to keep your posts going out",
  posterReady: "Your pictures are ready for your approval",
  posterReadyBody: "Check them so your posts can go out",
  posterAutoApproved: "We approved your pictures for you",
  posterAutoApprovedBody: "Your posts will go out as planned",
  weekLapsed: "This week's posts did not go out",
  weekLapsedBody: "The pictures were not approved in time",
  postHeld: "A post is on hold",
  postHeldBody: "Reconnect your account to let it go out",
  postMissed: "A post missed its time",
  postMissedBody: "Open Social to see what to do next",
  posterExpiring: "Your pictures will expire in 2 days",
  posterExpiringBody: "Approve them to keep them",
  posterExpired: "Your pictures have expired",
} as const;

/** Where each notice opens. */
const SOCIAL = "/social";
const BILLING = "/billing";
const WEBSITE = "/website";

export const BELL_COPY: CopyModule<BellCopy> = {
  "kickoff.booked": ({ when }) => ({ title: KICKOFF_LINES.booked(when), link: CUSTOMER_CALLS }),
  "kickoff.soon": ({ when }) => ({ title: KICKOFF_LINES.soon(when), link: CUSTOMER_CALLS }),
  "kickoff.completed": () => ({ title: KICKOFF_LINES.completed, link: "/" }),
  "kickoff.not_joined": ({ when }) => ({ title: KICKOFF_LINES.notJoined(when), link: CUSTOMER_CALLS }),
  "kickoff.reschedule": () => ({ title: KICKOFF_LINES.reschedule, link: CUSTOMER_CALLS }),
  "kickoff.fallback_started": () => ({ title: KICKOFF_LINES.fallbackStarted, link: "/" }),
  "call.changed.staff": ({ what, when }) => ({ title: `A call was ${what} on Cal.com`, body: when, link: STAFF_CALLS }),
  "kickoff.ended": ({ businessName }) => ({ title: KICKOFF_LINES.ended(businessName), link: STAFF_CALLS }),
  "kickoff.fallback_started.staff": ({ businessName }) => ({ title: KICKOFF_LINES.fallbackStartedStaff, body: businessName, link: STAFF_CALLS }),
  // B. Money
  "billing.payment_received": () => ({ title: EVENT_LINES.paymentReceived, link: BILLING }),
  "billing.payment_failed": () => ({ title: EVENT_LINES.paymentFailed, body: EVENT_LINES.paymentFailedBody, link: "/billing/payment" }),
  "billing.renewal_upcoming": ({ when }) => ({ title: EVENT_LINES.renewalUpcoming(when), link: BILLING }),
  "billing.plan_lapsed": () => ({ title: EVENT_LINES.planLapsed, body: EVENT_LINES.planLapsedBody, link: "/billing/payment" }),
  "billing.refund": () => ({ title: EVENT_LINES.refund, link: BILLING }),
  "billing.unapplied_payment": () => ({ title: EVENT_LINES.unappliedPayment, body: EVENT_LINES.unappliedPaymentBody, link: BILLING }),
  "billing.balance_due": () => ({ title: EVENT_LINES.balanceDue, link: "/checkout" }),
  // C. Website
  "website.started": () => ({ title: EVENT_LINES.started, link: WEBSITE }),
  "website.preview_ready": () => ({ title: EVENT_LINES.previewReady, link: WEBSITE }),
  "website.changes_sent": () => ({ title: EVENT_LINES.changesSent, link: WEBSITE }),
  "website.approval_received": () => ({ title: EVENT_LINES.approvalReceived, link: WEBSITE }),
  "website.live": () => ({ title: EVENT_LINES.live, link: WEBSITE }),
  "website.domain_ready": ({ state }) => (state === "ready" ? { title: EVENT_LINES.domainReady, link: "/domain" } : { title: EVENT_LINES.domainMoved, link: WEBSITE }),
  // D. Requests
  "request.received": ({ ticketId }) => ({ title: EVENT_LINES.requestReceived, link: `/requests/${ticketId}` }),
  "request.reply": ({ ticketId, update }) => ({ title: EVENT_LINES.requestUpdate[update], link: `/requests/${ticketId}` }),
  // E. Social
  "social.post_failed": () => ({ title: SOCIAL_LINES.postFailed, body: SOCIAL_LINES.postFailedBody, link: SOCIAL }),
  "social.connection_expiring": ({ daysLeft }) => ({ title: SOCIAL_LINES.connectionExpiring(daysLeft), body: SOCIAL_LINES.connectionBody, link: SOCIAL }),
  "social.poster_ready": () => ({ title: SOCIAL_LINES.posterReady, body: SOCIAL_LINES.posterReadyBody, link: SOCIAL }),
  "social.poster_auto_approved": () => ({ title: SOCIAL_LINES.posterAutoApproved, body: SOCIAL_LINES.posterAutoApprovedBody, link: SOCIAL }),
  "social.week_lapsed": () => ({ title: SOCIAL_LINES.weekLapsed, body: SOCIAL_LINES.weekLapsedBody, link: SOCIAL }),
  "social.post_held": () => ({ title: SOCIAL_LINES.postHeld, body: SOCIAL_LINES.postHeldBody, link: SOCIAL }),
  "social.post_missed": () => ({ title: SOCIAL_LINES.postMissed, body: SOCIAL_LINES.postMissedBody, link: SOCIAL }),
  "social.poster_expiring": () => ({ title: SOCIAL_LINES.posterExpiring, body: SOCIAL_LINES.posterExpiringBody, link: SOCIAL }),
  "social.poster_expired": () => ({ title: SOCIAL_LINES.posterExpired, link: SOCIAL }),
  // F. Account and system
  "account.monthly_report": ({ month }) => ({ title: EVENT_LINES.monthlyReport, link: `/reports/${month}` }),
  "account.closure": () => ({ title: EVENT_LINES.closure, body: EVENT_LINES.closureBody, link: "/" }),
};
