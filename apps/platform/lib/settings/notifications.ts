import { NOTIFICATION_TOPICS, type NotificationTopic } from "@brandbasket/db";
import { z } from "zod";

export const NOTIFICATIONS_SETTINGS_PATH = "/settings/notifications";

/** The rows of Settings, Notifications. Keyed by topic so a new topic fails to compile until it has words. */
const TOPIC_LABELS: Readonly<Record<NotificationTopic, string>> = {
  new_enquiry: "A new enquiry arrives",
  needs_approval: "Something needs your approval",
  request_reply: "We reply to a request",
  billing: "An invoice is ready or a payment fails",
  monthly_report: "Your monthly report is ready",
  product_news: "Product news from Brandbasket",
};

export interface NotificationRow {
  readonly topic: NotificationTopic;
  readonly label: string;
  readonly email: boolean;
}

/** One row per topic, in the database's order, with the person's effective email choice. */
export function notificationRows(choices: Readonly<Record<NotificationTopic, boolean>>): readonly NotificationRow[] {
  return NOTIFICATION_TOPICS.map((topic) => ({ topic, label: TOPIC_LABELS[topic], email: choices[topic] }));
}

/** What the switch sends: a known topic and the new choice. Anything else is refused. */
export const notificationChoiceSchema = z.object({ topic: z.enum(NOTIFICATION_TOPICS), email: z.boolean() });

export type NotificationChoiceState = { readonly status: "saved" } | { readonly status: "error"; readonly message: string };

export const NOTIFICATION_UNKNOWN_TOPIC = "That setting does not exist.";
export const NOTIFICATION_SAVE_FAILED = "We could not save that. Try again in a moment.";
