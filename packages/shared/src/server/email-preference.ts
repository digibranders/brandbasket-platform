import { shouldEmail, type Database, type NotificationTopic } from "@brandbasket/db";

/**
 * Whether to send this email, failing open: if the preference cannot be read, `onLookupError` reports it (in the caller's own
 * log format) and the answer is yes, as if the preference were on. A broken lookup must not cost a customer a bill or an approval.
 */
export async function emailPreferenceAllows(
  db: Database,
  userId: string,
  businessId: string,
  topic: NotificationTopic,
  onLookupError: (error: unknown) => void,
): Promise<boolean> {
  try {
    return await shouldEmail(db, userId, businessId, topic);
  } catch (error) {
    onLookupError(error);
    return true;
  }
}
