import {
  getChannelChoices,
  listNotificationRecipients,
  recordNotification,
  type ChannelChoices,
  type Database,
  type NotificationChannel,
  type NotificationRecipient,
  type NotificationRow,
  type NotificationTopic,
  type RecordedNotification,
} from "@brandbasket/db";
import { createAppEmailTransport, notificationEmail, type EmailMessage } from "@brandbasket/email";
import {
  bellCopyFor,
  eventDefinition,
  emailCopyFor,
  pushCopyFor,
  type BellCopy,
  type EmailCopy,
  type EventDataMap,
  type NotificationEventKey,
  type PushCopy,
} from "../lib/notification-events";
import { createFakePushSender, type PushSender } from "./push-sender";

/*
 * notify(): the one place a notice about an event is sent from. It writes the bell row, queues the email through the existing
 * outbox, hands the push to the push sender, checks each person's preferences (mandatory events skip the check, optional ones
 * fail closed when the preference cannot be read), stops a repeat by dedupe key, and never throws into the caller: a failure is
 * reported through `onError` and shows in the result. Every other package only calls this.
 */

/** Who a notice is for: a customer business (its owner, or the listed members), or the one staff account. */
export type NotifyAudience =
  | { readonly kind: "customer"; readonly businessId: string; readonly userIds?: readonly string[] }
  | { readonly kind: "staff"; readonly businessId?: string };

export interface NotifyInput<K extends NotificationEventKey> {
  readonly event: K;
  readonly audience: NotifyAudience;
  /** What makes this the same notice as an earlier one, e.g. a call id. It is combined with the event, so two events may share it. */
  readonly dedupeKey: string;
  readonly data: EventDataMap[K];
}

export type RecipientStatus = "delivered" | "duplicate" | "failed";
export type SkipReason = "off" | "no_wording" | "no_address";

export interface RecipientResult {
  /** Null for the staff account. */
  readonly userId: string | null;
  readonly status: RecipientStatus;
  /** The channels that went out. */
  readonly delivered: readonly NotificationChannel[];
  readonly skipped: readonly { readonly channel: NotificationChannel; readonly reason: SkipReason }[];
}

export interface NotifyResult {
  readonly event: NotificationEventKey;
  readonly recipients: readonly RecipientResult[];
  /** True when any step failed. The caller needs to do nothing: it is already reported. */
  readonly failed: boolean;
}

export type NotifyStep = "audience" | "recipients" | "preferences" | "record" | "email" | "push";

export interface NotifyErrorContext {
  readonly event: NotificationEventKey;
  readonly step: NotifyStep;
  readonly userId: string | null;
}

/** What notify() reads and writes in the database. The default is createDbNotifyStore; tests pass a fake. */
export interface NotifyStore {
  readonly recipients: (businessId: string, userIds?: readonly string[]) => Promise<NotificationRecipient[]>;
  /** Throws when the lookup fails. */
  readonly choices: (userId: string, businessId: string, topic: NotificationTopic) => Promise<ChannelChoices>;
  readonly record: (row: NotificationRow) => Promise<RecordedNotification>;
}

export interface NotifyDeps {
  readonly store: NotifyStore;
  /** Delivers one email: the app's customer transport, which writes the outbox row. */
  readonly sendEmail: (message: EmailMessage) => Promise<void>;
  readonly push: PushSender;
  /** The two apps' origins, for the links in emails and pushes. */
  readonly origins: { readonly customer: string; readonly staff: string };
  /** Where staff email goes; null means none is set and staff emails are skipped. */
  readonly staffEmail: string | null;
  /** Reports a failure in the app's own way (its error log). Must not throw. */
  readonly onError: (error: unknown, context: NotifyErrorContext) => void;
}

export type Notify = <K extends NotificationEventKey>(input: NotifyInput<K>) => Promise<NotifyResult>;

/** Staff and mandatory events send on every channel: nothing is read. */
const ALL_ON: ChannelChoices = { bell: true, email: true, push: true };

export function createDbNotifyStore(db: Database): NotifyStore {
  return {
    recipients: (businessId, userIds) => listNotificationRecipients(db, businessId, userIds),
    choices: (userId, businessId, topic) => getChannelChoices(db, userId, businessId, topic),
    record: (row) => recordNotification(db, row),
  };
}

/** A recipient notify() writes for: a customer member, or the staff account. */
interface Target {
  readonly userId: string | null;
  readonly email: string | null;
}

function absolute(origin: string, link: string): string {
  return new URL(link, origin).toString();
}

function emailMessage(event: NotificationEventKey, to: string, copy: EmailCopy, origin: string): EmailMessage {
  return notificationEmail({
    to,
    template: event.replaceAll(".", "-"),
    subject: copy.subject,
    paragraphs: copy.paragraphs,
    button: copy.button === undefined ? undefined : { label: copy.button.label, url: absolute(origin, copy.button.link) },
  });
}

/** Builds notify() over its dependencies. An app builds one per request or per process, with its own database and error log. */
export function createNotifier(deps: NotifyDeps): Notify {
  async function deliver(
    event: NotificationEventKey,
    data: unknown,
    target: Target,
    context: { readonly audience: "customer" | "staff"; readonly businessId: string | null; readonly dedupeKey: string; readonly choices: ChannelChoices },
  ): Promise<RecipientResult> {
    const definition = eventDefinition(event);
    const origin = context.audience === "customer" ? deps.origins.customer : deps.origins.staff;
    const bell = definition.channels.includes("bell") ? bellCopyFor(event, data as never) : null;
    const email = definition.channels.includes("email") ? emailCopyFor(event, data as never) : null;
    const push = definition.channels.includes("push") ? pushCopyFor(event, data as never) : null;
    const to = context.audience === "customer" ? target.email : deps.staffEmail;

    const skipped: { channel: NotificationChannel; reason: SkipReason }[] = [];
    const wants = (channel: NotificationChannel, copy: BellCopy | EmailCopy | PushCopy | null, address: string | null = "present"): boolean => {
      if (!definition.channels.includes(channel)) return false;
      if (copy === null) skipped.push({ channel, reason: "no_wording" });
      else if (!context.choices[channel]) skipped.push({ channel, reason: "off" });
      else if (address === null) skipped.push({ channel, reason: "no_address" });
      else return true;
      return false;
    };
    const bellOn = wants("bell", bell);
    const emailOn = wants("email", email, to);
    const pushOn = wants("push", push);

    const result = { userId: target.userId, delivered: [] as NotificationChannel[], skipped };
    const fail = (step: NotifyStep, error: unknown): void => {
      deps.onError(error, { event, step, userId: target.userId });
    };

    // The row first: it is the ledger that makes a repeat a no-op, whatever channels the event uses.
    let recorded: RecordedNotification;
    try {
      recorded = await deps.store.record({
        audience: context.audience,
        businessId: context.businessId,
        userId: target.userId,
        eventKey: event,
        title: bell?.title ?? event,
        body: bell?.body ?? null,
        link: bell?.link ?? null,
        listed: bellOn,
        dedupeKey: context.dedupeKey,
      });
    } catch (error) {
      fail("record", error);
      return { ...result, status: "failed" };
    }
    if (!recorded.created) return { ...result, status: "duplicate", skipped: [] };
    if (bellOn) result.delivered.push("bell");

    let failed = false;
    if (emailOn && email !== null && to !== null) {
      try {
        await deps.sendEmail(emailMessage(event, to, email, origin));
        result.delivered.push("email");
      } catch (error) {
        failed = true;
        fail("email", error);
      }
    }
    if (pushOn && push !== null) {
      try {
        await deps.push.send(
          { audience: context.audience, userId: target.userId },
          { title: push.title, body: push.body, url: absolute(origin, push.link), tag: push.tag },
        );
        result.delivered.push("push");
      } catch (error) {
        failed = true;
        fail("push", error);
      }
    }
    return { ...result, status: failed ? "failed" : "delivered" };
  }

  return async function notify<K extends NotificationEventKey>(input: NotifyInput<K>): Promise<NotifyResult> {
    const { event, audience } = input;
    const definition = eventDefinition(event);
    const dedupeKey = `${event}:${input.dedupeKey}`;
    const done = (recipients: readonly RecipientResult[], failed = recipients.some((entry) => entry.status === "failed")): NotifyResult => ({ event, recipients, failed });

    if (definition.audience !== audience.kind) {
      deps.onError(new RangeError(`${event} is a ${definition.audience} event, not a ${audience.kind} one.`), { event, step: "audience", userId: null });
      return done([], true);
    }

    if (audience.kind === "staff") {
      const recipient = await deliver(event, input.data, { userId: null, email: deps.staffEmail }, {
        audience: "staff",
        businessId: audience.businessId ?? null,
        dedupeKey,
        choices: ALL_ON,
      });
      return done([recipient]);
    }

    let recipients: NotificationRecipient[];
    try {
      recipients = await deps.store.recipients(audience.businessId, audience.userIds);
    } catch (error) {
      deps.onError(error, { event, step: "recipients", userId: null });
      return done([], true);
    }

    const results: RecipientResult[] = [];
    for (const recipient of recipients) {
      let choices = ALL_ON;
      if (!definition.mandatory && definition.topic !== null) {
        try {
          choices = await deps.store.choices(recipient.userId, audience.businessId, definition.topic);
        } catch (error) {
          // Optional notices fail closed: a person who may have switched this off is not sent it on a guess.
          deps.onError(error, { event, step: "preferences", userId: recipient.userId });
          results.push({ userId: recipient.userId, status: "failed", delivered: [], skipped: [] });
          continue;
        }
      }
      results.push(await deliver(event, input.data, { userId: recipient.userId, email: recipient.email }, { audience: "customer", businessId: audience.businessId, dedupeKey, choices }));
    }
    return done(results);
  };
}

export interface DefaultNotifierOptions {
  readonly push?: PushSender;
  readonly onError: NotifyDeps["onError"];
  readonly env?: Readonly<Record<string, string | undefined>>;
}

/**
 * notify() for an app's server code: the staff connection for the ledger and the preference reads, the app's email transport
 * (the outbox locally, Brevo in production), the fake push sender until package N4 supplies the real one, and the origins
 * and team address from the environment.
 */
export function createDefaultNotifier(db: Database, options: DefaultNotifierOptions): Notify {
  const env = options.env ?? process.env;
  const customerOrigin = env.APP_ORIGIN?.trim();
  const staffOrigin = env.ADMIN_ORIGIN?.trim();
  if (!customerOrigin || !staffOrigin) throw new Error("APP_ORIGIN and ADMIN_ORIGIN must be set for notifications to link to the apps.");
  const transport = createAppEmailTransport(db);
  return createNotifier({
    store: createDbNotifyStore(db),
    sendEmail: (message) => transport.send(message),
    push: options.push ?? createFakePushSender(),
    origins: { customer: customerOrigin, staff: staffOrigin },
    staffEmail: env.SUPPORT_ALERT_EMAIL?.trim() || env.BRANDBASKET_TEAM_EMAIL?.trim() || null,
    onError: options.onError,
  });
}
