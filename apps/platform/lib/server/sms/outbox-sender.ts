import "server-only";
import { insertSmsMessage, type Database } from "@firstfold/db";
import type { SmsMessage, SmsSender } from "./types";

/** The default SMS "provider": writes to the `sms_messages` table instead of sending anything, so booking can be
 * exercised end to end locally and in test without a real SMS account. The admin outbox page (SMS section) is the
 * only place the code is visible while this is the active provider. */
export function createOutboxSender(db: Database): SmsSender {
  return {
    async send(message: SmsMessage): Promise<void> {
      await insertSmsMessage(db, { businessId: message.businessId, toPhone: message.to, body: message.body });
    },
  };
}
