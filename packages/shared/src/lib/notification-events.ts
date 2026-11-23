import type { NotificationTopic } from "@brandbasket/db";
import { BELL_COPY } from "./notification-copy-bell";
import { EMAIL_COPY } from "./notification-copy-email";
import { PUSH_COPY } from "./notification-copy-push";

/*
 * The registry of everything notify() can send (packages/shared/src/server/notify.ts): one entry per row of
 * docs/notifications/02-target-matrix.md. An entry says who the notice is for, which topic switches it, whether it can be
 * switched off at all, and where it goes. The words live in one module per channel (notification-copy-bell.ts, -email.ts,
 * -push.ts). Client safe: only types are imported from the database package.
 */

/** Every place a notice can show up. notify() carries bell, email and push; the others are listed so the matrix is whole in one place. */
export type DeliveryChannel = "bell" | "email" | "push" | "teams" | "today" | "popup";

export type EventAudience = "customer" | "staff";

/** What a caller passes with an event: just what the words need. Events that have no wording yet take no data. */
type NoData = Readonly<Record<never, never>>;

export interface EventDataMap {
  "kickoff.booked": { readonly when: string };
  "kickoff.booked.staff": NoData;
  "kickoff.soon": { readonly when: string };
  "kickoff.ended": { readonly businessName: string };
  "kickoff.completed": NoData;
  "kickoff.not_joined": { readonly when: string };
  "kickoff.reschedule": NoData;
  "kickoff.fallback_started.staff": { readonly businessName: string };
  "kickoff.fallback_started": NoData;
  /** A call booked on Cal.com's own page, or moved or cancelled from Cal.com's email (package N6). `when` is the new time, already written for staff. */
  "call.changed.staff": { readonly what: "booked" | "moved" | "cancelled"; readonly when?: string };
  "billing.payment_received": NoData;
  "billing.payment_failed": NoData;
  "billing.payment_failed.staff": NoData;
  "billing.renewal_upcoming": NoData;
  "billing.plan_lapsed": NoData;
  "billing.refund": NoData;
  "billing.unapplied_payment": NoData;
  "billing.payment_needs_look.staff": NoData;
  "website.started": NoData;
  "website.preview_ready": NoData;
  "website.changes_sent": NoData;
  "website.changes_or_approved.staff": NoData;
  "website.approval_received": NoData;
  "website.live": NoData;
  "website.domain_ready": NoData;
  "request.received": NoData;
  "request.reply": NoData;
  "request.new.staff": NoData;
  "social.post_failed": NoData;
  "social.connection_expiring": NoData;
  "social.poster_ready": NoData;
  "social.poster_auto_approved": NoData;
  "social.week_lapsed": NoData;
  "social.attention.staff": NoData;
  "account.closure": NoData;
  "account.monthly_report": NoData;
  "account.security_alert.staff": NoData;
}

export type NotificationEventKey = keyof EventDataMap;

/**
 * The "Always sent" lines on Settings, Notifications: what a customer cannot switch off, in plain words. One line can
 * cover several events. Draft wording, awaiting the owner's yes.
 */
const ALWAYS_SENT = {
  payments: "A payment is received, fails or is refunded",
  plan: "Your plan lapses",
  call: "Your kickoff call is booked or finished",
  website: "Your website is started, approved or live",
  account: "Your account is closed",
} as const;
type AlwaysSentKey = keyof typeof ALWAYS_SENT;

export interface EventDefinition {
  readonly key: NotificationEventKey;
  readonly audience: EventAudience;
  /** The preference topic that switches the optional channels; null when nothing can switch the event. */
  readonly topic: NotificationTopic | null;
  /** True: preferences are not read and every channel goes. Customer events with no topic are always mandatory. */
  readonly mandatory: boolean;
  readonly channels: readonly DeliveryChannel[];
  /** Which "Always sent" line on Settings covers this event. */
  readonly alwaysSent?: AlwaysSentKey;
}

const customer = (
  key: NotificationEventKey,
  topic: NotificationTopic | null,
  channels: readonly DeliveryChannel[],
  options: { readonly mandatory?: boolean; readonly alwaysSent?: AlwaysSentKey } = {},
): EventDefinition => ({ key, audience: "customer", topic, mandatory: topic === null || options.mandatory === true, channels, alwaysSent: options.alwaysSent });

const staff = (key: NotificationEventKey, channels: readonly DeliveryChannel[]): EventDefinition => ({ key, audience: "staff", topic: null, mandatory: true, channels });

const DEFINITIONS: readonly EventDefinition[] = [
  // A. Kickoff call (decision D33)
  customer("kickoff.booked", null, ["email", "bell"], { alwaysSent: "call" }),
  staff("kickoff.booked.staff", ["teams", "today"]),
  customer("kickoff.soon", "calls", ["email", "push", "bell"]),
  staff("kickoff.ended", ["popup", "bell", "push", "email"]),
  customer("kickoff.completed", null, ["bell", "email"], { alwaysSent: "call" }),
  customer("kickoff.not_joined", null, ["email", "bell"], { alwaysSent: "call" }),
  customer("kickoff.reschedule", null, ["email", "bell"], { alwaysSent: "call" }),
  staff("kickoff.fallback_started.staff", ["today", "bell"]),
  customer("kickoff.fallback_started", null, ["bell"], { alwaysSent: "website" }),
  staff("call.changed.staff", ["teams", "bell"]),
  // B. Money. Payment failed is mandatory by the owner's answer of 2026-11-16, which overrides the matrix row that made email and push optional.
  customer("billing.payment_received", null, ["email", "bell"], { alwaysSent: "payments" }),
  customer("billing.payment_failed", "billing", ["email", "bell", "push"], { mandatory: true, alwaysSent: "payments" }),
  staff("billing.payment_failed.staff", ["today", "teams"]),
  customer("billing.renewal_upcoming", "billing", ["email", "bell"]),
  customer("billing.plan_lapsed", null, ["email", "bell"], { alwaysSent: "plan" }),
  customer("billing.refund", null, ["email", "bell"], { alwaysSent: "payments" }),
  customer("billing.unapplied_payment", null, ["email", "bell"], { alwaysSent: "payments" }),
  staff("billing.payment_needs_look.staff", ["today", "push"]),
  // C. Website
  customer("website.started", null, ["bell", "email"], { alwaysSent: "website" }),
  customer("website.preview_ready", "needs_approval", ["email", "bell", "push"]),
  customer("website.changes_sent", null, ["email", "bell"]),
  staff("website.changes_or_approved.staff", ["today", "teams"]),
  customer("website.approval_received", null, ["email", "bell"], { alwaysSent: "website" }),
  customer("website.live", null, ["email", "bell", "push"], { alwaysSent: "website" }),
  customer("website.domain_ready", null, ["email", "bell"]),
  // D. Requests and support
  customer("request.received", "request_reply", ["email", "bell"]),
  customer("request.reply", "request_reply", ["email", "bell", "push"]),
  staff("request.new.staff", ["email", "teams", "today", "push"]),
  // E. Social
  customer("social.post_failed", "social", ["bell", "email", "push"]),
  customer("social.connection_expiring", "social", ["bell", "email", "push"]),
  customer("social.poster_ready", "needs_approval", ["bell", "email", "push"]),
  customer("social.poster_auto_approved", "social", ["bell"]),
  customer("social.week_lapsed", "social", ["bell", "email"]),
  staff("social.attention.staff", ["today"]),
  // F. Account and security. Sign-up codes, password resets and invites stay direct, mandatory emails sent by their own flows.
  customer("account.closure", null, ["email", "bell"], { alwaysSent: "account" }),
  customer("account.monthly_report", "monthly_report", ["email", "bell", "push"]),
  staff("account.security_alert.staff", ["email", "push", "teams"]),
];

export const NOTIFICATION_EVENTS: Readonly<Record<NotificationEventKey, EventDefinition>> = Object.fromEntries(
  DEFINITIONS.map((definition) => [definition.key, definition]),
) as Record<NotificationEventKey, EventDefinition>;

export const NOTIFICATION_EVENT_KEYS: readonly NotificationEventKey[] = DEFINITIONS.map((definition) => definition.key);

export function isNotificationEventKey(value: string): value is NotificationEventKey {
  return Object.hasOwn(NOTIFICATION_EVENTS, value);
}

export function eventDefinition(key: NotificationEventKey): EventDefinition {
  return NOTIFICATION_EVENTS[key];
}

/** The lines Settings lists as "Always sent", in order, one per kind of mandatory customer notice. */
export const ALWAYS_SENT_LINES: readonly string[] = [
  ...new Set(DEFINITIONS.flatMap((definition) => (definition.audience === "customer" && definition.mandatory && definition.alwaysSent !== undefined ? [ALWAYS_SENT[definition.alwaysSent]] : []))),
];

/** What the bell shows for a notice. A title and an optional line; the link is a path inside the app. */
export interface BellCopy {
  readonly title: string;
  readonly body?: string;
  readonly link: string;
}

/** What an email says: the subject, the paragraphs, and at most one button whose link is a path inside the app. */
export interface EmailCopy {
  readonly subject: string;
  readonly paragraphs: readonly string[];
  readonly button?: { readonly label: string; readonly link: string };
}

/** What a push shows. No private detail: a short line and a page to open. `tag` makes a repeat replace the one before it. */
export interface PushCopy {
  readonly title: string;
  readonly body?: string;
  readonly link: string;
  readonly tag: string;
}

export type CopyModule<Copy> = { readonly [K in NotificationEventKey]?: (data: EventDataMap[K]) => Copy };

function copyFrom<Copy>(module: CopyModule<Copy>, key: NotificationEventKey, data: unknown): Copy | null {
  const build = module[key] as ((data: unknown) => Copy) | undefined;
  return build === undefined ? null : build(data);
}

/** The bell's words for an event, or null when the event has none yet (EVENTS_WITHOUT_WORDING). */
export function bellCopyFor<K extends NotificationEventKey>(key: K, data: EventDataMap[K]): BellCopy | null {
  return copyFrom(BELL_COPY, key, data);
}

export function emailCopyFor<K extends NotificationEventKey>(key: K, data: EventDataMap[K]): EmailCopy | null {
  return copyFrom(EMAIL_COPY, key, data);
}

export function pushCopyFor<K extends NotificationEventKey>(key: K, data: EventDataMap[K]): PushCopy | null {
  return copyFrom(PUSH_COPY, key, data);
}

/**
 * Events with a channel but no words on it yet. The matrix has draft wording only for the kickoff call; package N5 adds
 * the rest and empties this list. notify() skips a channel that has no words and says so in its result.
 */
export const EVENTS_WITHOUT_WORDING: readonly NotificationEventKey[] = NOTIFICATION_EVENT_KEYS.filter((key) => {
  const { channels } = eventDefinition(key);
  const sample = {} as never;
  return (
    (channels.includes("bell") && bellCopyFor(key, sample) === null) ||
    (channels.includes("email") && emailCopyFor(key, sample) === null) ||
    (channels.includes("push") && pushCopyFor(key, sample) === null)
  );
});
