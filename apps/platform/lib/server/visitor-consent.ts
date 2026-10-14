import "server-only";
import { recordConsent, type ConsentPurpose, type ContributionConsent, type Database } from "@fynix/db";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";

/**
 * Keeps what a directory visitor agreed to when their review or comment was published (DPDP Act s.5, s.6, s.9, r.3):
 * the notice they saw, and that they said they are 18 or over. Two rows, so each can be asked for on its own. Nothing is
 * written for a post that carried no notice version (a site that does not send it yet). A failure to write is logged and
 * never undoes a post that is already live.
 */
export async function recordContributionConsent(db: Database, visitorId: string, consent: ContributionConsent | null | undefined): Promise<void> {
  if (consent === null || consent === undefined) return;
  const purposes: ConsentPurpose[] = ["directory_contribution"];
  if (consent.adult) purposes.push("adult_declaration");
  if (consent.ownerContact === true) purposes.push("owner_contact");
  try {
    for (const purpose of purposes) {
      await recordConsent(db, { subject: { type: "visitor", ref: visitorId }, purpose, noticeVersion: consent.noticeVersion, channel: "web" });
    }
  } catch (error) {
    console.error("A directory visitor's consent record could not be written.", errorLogInfo(error));
  }
}
