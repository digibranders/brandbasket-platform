import { join } from "node:path";
import { createDatabase, purgeExpiredRetention, purgeOldEmailMessages } from "@brandbasket/db";
import {
  findWorkspaceRoot,
  loadLocalEnv,
  requireEnv,
} from "@brandbasket/db/local-env";
import { createAppEmailTransport } from "@brandbasket/email";
import { getSupportStorage } from "@brandbasket/shared/server/support-storage";
import { privacyAlertRecipient, sendPrivacyRequestReminders } from "../lib/privacy-request-alerts";
import { securityAlertRecipient, sendStaffAccessReview } from "../lib/security-review";
import { retentionReport } from "../lib/retention-report";
import { runSupportMaintenance } from "../lib/server/support-attachment-maintenance";

/** Emails the privacy mailbox about open requests near or past their due date. A failure here fails the run, so it is seen. */
async function remindAboutPrivacyRequests(db: Parameters<typeof createAppEmailTransport>[0]): Promise<void> {
  const adminOrigin = process.env.ADMIN_ORIGIN?.trim();
  if (!adminOrigin) {
    console.error("Privacy request reminders skipped: ADMIN_ORIGIN is not set.");
    process.exitCode = 1;
    return;
  }
  try {
    const { listed } = await sendPrivacyRequestReminders(db, createAppEmailTransport(db), { to: privacyAlertRecipient(process.env), adminOrigin, now: new Date() });
    console.log(listed === 0 ? "Privacy requests: none due." : `Privacy requests: ${listed} listed in tonight's email.`);
  } catch (error) {
    console.error("Privacy request reminders failed", error);
    process.exitCode = 1;
  }
}

/** Emails the team when the last day's staff access log shows anything unusual. A failure here fails the run, so it is seen. */
async function reviewStaffAccess(db: Parameters<typeof createAppEmailTransport>[0]): Promise<void> {
  const adminOrigin = process.env.ADMIN_ORIGIN?.trim();
  if (!adminOrigin) {
    console.error("Staff access review skipped: ADMIN_ORIGIN is not set.");
    process.exitCode = 1;
    return;
  }
  try {
    const listed = await sendStaffAccessReview(db, createAppEmailTransport(db), { to: securityAlertRecipient(process.env), adminOrigin, now: new Date() });
    console.log(listed === 0 ? "Staff access review: nothing unusual." : `Staff access review: ${listed} items emailed.`);
  } catch (error) {
    console.error("Staff access review failed", error);
    process.exitCode = 1;
  }
}

async function main(): Promise<void> {
  loadLocalEnv();
  process.chdir(join(findWorkspaceRoot(), "apps", "platform"));
  const { db, close } = createDatabase(requireEnv("DATABASE_URL_STAFF"), {
    max: 1,
  });
  try {
    const result = await runSupportMaintenance(db, getSupportStorage());
    console.log(
      `Support maintenance: ${result.purged} screenshots purged; ${result.failed} objects retained for retry; ${result.ticketsPurged} closed tickets purged; ${result.errorIssuesPurged} resolved error issues purged.`,
    );
    const emailsPurged = await purgeOldEmailMessages(db, new Date());
    console.log(`Outbox: ${emailsPurged} old emails purged.`);
    console.log(retentionReport(await purgeExpiredRetention(db, new Date()), false));
    await remindAboutPrivacyRequests(db);
    await reviewStaffAccess(db);
    if (result.failed > 0) process.exitCode = 1;
  } finally {
    await close();
  }
}
main().catch((error: unknown) => {
  console.error("Support attachment maintenance failed", error);
  process.exitCode = 1;
});
