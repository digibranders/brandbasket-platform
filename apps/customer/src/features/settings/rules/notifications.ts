import { NOTIFICATION_TOPICS, type ChannelChoices, type NotificationTopic } from "@brandbasket/db";
import { ALWAYS_SENT_LINES } from "@brandbasket/shared/lib/notification-events";

/** The rows of Settings, Notifications, worded as in the approved mock. Keyed by topic so a new topic fails to compile until it has words. */
const TOPIC_LABELS: Readonly<Record<NotificationTopic, string>> = {
  new_enquiry: "A new enquiry arrives",
  needs_approval: "Something needs your approval",
  request_reply: "We reply to a request",
  billing: "An invoice is ready or a payment fails",
  monthly_report: "Your monthly report is ready",
  product_news: "Product news from Brandbasket",
  calls: "A call with us is coming up",
  social: "Your social media needs attention",
};

export interface NotificationRow {
  readonly topic: NotificationTopic;
  readonly label: string;
  readonly bell: boolean;
  readonly email: boolean;
  readonly push: boolean;
}

/** One row per topic, in the database's order, with the person's effective choice on each channel. */
export function notificationRows(choices: Readonly<Record<NotificationTopic, ChannelChoices>>): readonly NotificationRow[] {
  return NOTIFICATION_TOPICS.map((topic) => ({ topic, label: TOPIC_LABELS[topic], ...choices[topic] }));
}

/** What the customer cannot switch off, listed under the table as "Always sent". Comes from the event registry, so the list follows the code. */
export function alwaysSentLines(): readonly string[] {
  return ALWAYS_SENT_LINES;
}
