import { NOTIFICATION_TOPICS, type NotificationTopic } from "@brandbasket/db";

/** The rows of Settings, Notifications, worded as in the approved mock. Keyed by topic so a new topic fails to compile until it has words. */
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
