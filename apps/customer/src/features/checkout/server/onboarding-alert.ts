import "server-only";
import { FIRST_PREVIEW_DUE_HOURS } from "@brandbasket/db";
import { createAppEmailTransport, emailTeamInboxDefault, onboardingSentEmail } from "@brandbasket/email";
import { reportError } from "@/lib/report";
import { adminOrigin } from "./admin-origin";
import { getStaffDb } from "./db";
import { announceCustomerToTeams } from "./teams";

/**
 * Tells the team a customer has sent their website details, so the first-preview clock does not start unnoticed. Ported from
 * apps/platform lib/server/onboarding-alert.ts.
 *
 * Sent only after the submission has committed, and best-effort: a failed email is reported and never undoes or blocks what
 * the customer has already sent. It goes through the staff connection because the customer connection cannot write the email
 * outbox. The message names the business and links to its page in the console; the customer's details stay there.
 */
export async function notifyTeamOnboardingSent(businessId: string, businessName: string): Promise<void> {
  void announceCustomerToTeams({ businessId, event: "setup_sent", facts: [{ name: "First preview due in", value: `${FIRST_PREVIEW_DUE_HOURS} hours` }] });
  try {
    const to = process.env.BRANDBASKET_TEAM_EMAIL?.trim() || emailTeamInboxDefault();
    const clientUrl = new URL(`/clients/${businessId}`, adminOrigin()).toString();
    await createAppEmailTransport(getStaffDb()).send(onboardingSentEmail({ to, businessName, clientUrl, previewDueHours: FIRST_PREVIEW_DUE_HOURS }));
  } catch (error) {
    reportError(error, { area: "checkout.onboarding-sent-alert" });
  }
}
