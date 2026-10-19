import "server-only";
import { createAppEmailTransport, domainConnectedEmail, domainRequestedEmail, emailTeamInboxDefault } from "@brandbasket/email";
import { getStaffDb } from "./db";
import { serverEnv } from "./env";

/**
 * Tells the team a customer's DNS now points at their website, so it can be checked and marked live. Best-effort: a failed email
 * is logged and never changes what the customer sees. Sent through the staff connection, like the other team alerts, because the
 * customer connection cannot write the email outbox. It names the business and domain and links to the console; nothing else.
 */
export async function notifyTeamDomainConnected(businessId: string, businessName: string, domain: string): Promise<void> {
  try {
    const to = process.env.FYNIX_TEAM_EMAIL?.trim() || emailTeamInboxDefault();
    const clientUrl = new URL(`/clients/${businessId}`, serverEnv().ADMIN_ORIGIN).toString();
    await createAppEmailTransport(getStaffDb()).send(domainConnectedEmail({ to, businessName, domain, clientUrl }));
  } catch (error) {
    console.error("A customer's domain was found connected but the team notification failed.", { businessId, error });
  }
}

/**
 * Tells the team a live customer asked to move their website to a domain of their own, so they can add it to the website's host.
 * Best-effort, like the other team alerts: the request is already saved by the time this runs.
 */
export async function notifyTeamDomainRequested(businessId: string, businessName: string, domain: string): Promise<void> {
  try {
    const to = process.env.FYNIX_TEAM_EMAIL?.trim() || emailTeamInboxDefault();
    const clientUrl = new URL(`/clients/${businessId}`, serverEnv().ADMIN_ORIGIN).toString();
    await createAppEmailTransport(getStaffDb()).send(domainRequestedEmail({ to, businessName, domain, clientUrl }));
  } catch (error) {
    console.error("A customer asked to move to their own domain but the team notification failed.", { businessId, error });
  }
}
