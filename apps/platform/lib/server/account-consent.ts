import "server-only";
import { recordConsent, type Database } from "@fynix/db";
import { LEGAL_TEXT_VERSION } from "@fynix/shared/lib/privacy/notice-version";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";

/**
 * Keeps proof that the owner of a new account agreed to the Terms and Privacy Notice (DPDP Act s.6, r.3), with the
 * version they saw. Every form that opens an account refuses to go on with its box unticked, and calls this as soon as
 * the account exists. If the record cannot be written the person is not turned away after their account is open: the
 * failure is logged, and an account with no consent row can be found and put right.
 */
export async function recordAccountTermsConsent(db: Database, userId: string): Promise<void> {
  try {
    await recordConsent(db, {
      subject: { type: "user", ref: userId },
      purpose: "account_terms",
      noticeVersion: LEGAL_TEXT_VERSION,
      channel: "web",
    });
  } catch (error) {
    console.error("A new account's consent record could not be written.", errorLogInfo(error));
  }
}
