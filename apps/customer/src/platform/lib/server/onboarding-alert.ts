import "server-only";
import { FIRST_PREVIEW_DUE_HOURS } from "@brandbasket/db";
import { createAppEmailTransport, emailTeamInboxDefault, onboardingSentEmail } from "@brandbasket/email";
import { serverEnv } from "./env";
import { getStaffDb } from "./db";
import { announceCustomerToTeams } from "./teams";

/**
 * Tells the team a customer has sent their website details, so the first-preview clock does not start unnoticed.
 *
 * Sent only after the submission has committed, and best-effort: a failed email is logged and never undoes or blocks
 * what the customer has already sent. It goes through the staff connection, as support alerts do, because the customer
 * connection cannot write the email outbox. The message names the business and links to its page in the console; the
 * customer's details stay there.
 */
export async function notifyTeamOnboardingSent(businessId: string, businessName: string): Promise<void> {
  void announceCustomerToTeams({ businessId, event: "setup_sent", facts: [{ name: "First preview due in", value: `${FIRST_PREVIEW_DUE_HOURS} hours` }] });
  try {
    const to = process.env.BRANDBASKET_TEAM_EMAIL?.trim() || emailTeamInboxDefault();
    const clientUrl = new URL(`/clients/${businessId}`, serverEnv().ADMIN_ORIGIN).toString();
    await createAppEmailTransport(getStaffDb()).send(
      onboardingSentEmail({ to, businessName, clientUrl, previewDueHours: FIRST_PREVIEW_DUE_HOURS }),
    );
  } catch (error) {
    console.error("A customer sent their website details but the team notification failed.", { businessId, error });
  }
}
