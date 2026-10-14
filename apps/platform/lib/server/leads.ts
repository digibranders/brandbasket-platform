import "server-only";
import { consumeRateLimit, createLead, recordConsent, type RateLimitRule } from "@fynix/db";
import { billingCurrencyForPhone } from "@fynix/shared/lib/billing/currency-for-phone";
import { createAppEmailTransport, leadReceivedEmail } from "@fynix/email";
import { businessTypeLabel } from "@fynix/shared/lib/business-types";
import type { LeadInput } from "@fynix/shared/lib/lead-form";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { displayPhone } from "@fynix/shared/server/phone-display";
import { serverEnv } from "./env";
import type { LeadRecordOutcome } from "./lead-intake";
import { getPublicDb } from "./public-db";

const ONE_HOUR = 60 * 60;
/**
 * The client budget is enough for a shared office. The global one is the backstop: the client address is only as
 * honest as the website that forwarded it, so this caps the damage if that ever goes wrong.
 */
const GLOBAL_RULE: RateLimitRule = { limit: 60, windowSeconds: ONE_HOUR };
const PER_CLIENT_RULE: RateLimitRule = { limit: 5, windowSeconds: ONE_HOUR };
const PER_EMAIL_RULE: RateLimitRule = { limit: 3, windowSeconds: ONE_HOUR };

/**
 * Rate-limits, stores and announces an enquiry from the website, through the insert-only public role. With a
 * `noticeVersion` it also keeps proof of the notice the visitor saw (DPDP Act s.5, r.3): a failure to write that proof
 * is logged and never loses the lead.
 */
export async function recordLead(lead: LeadInput, clientIp: string, noticeVersion: string | null): Promise<LeadRecordOutcome> {
  const db = getPublicDb();
  try {
    for (const check of [
      { key: "lead:global", rule: GLOBAL_RULE },
      { key: `lead:client:${clientIp}`, rule: PER_CLIENT_RULE },
      { key: `lead:email:${lead.email}`, rule: PER_EMAIL_RULE },
    ]) {
      const result = await consumeRateLimit(db, check.key, check.rule);
      if (!result.allowed) return "limited";
    }

    const created = await createLead(db, { ...lead, currency: billingCurrencyForPhone(lead.phone) });
    if (noticeVersion !== null) await keepNoticeProof(created.id, noticeVersion);
    await notifyTeam(created.id, lead);
  } catch (error) {
    console.error("Could not record a lead from the Get started form.", error);
    return "failed";
  }
  return "recorded";
}

/** The lead is already saved by this point, so a failure here is logged and never shown to the visitor. */
async function keepNoticeProof(leadId: string, noticeVersion: string): Promise<void> {
  try {
    await recordConsent(getPublicDb(), { subject: { type: "lead", ref: leadId }, purpose: "lead_contact", noticeVersion, channel: "web" });
  } catch (error) {
    console.error("A lead's consent record could not be written.", { leadId, ...errorLogInfo(error) });
  }
}

/** The lead is already saved by this point, so a failure here is logged and never shown to the visitor. */
async function notifyTeam(leadId: string, lead: LeadInput): Promise<void> {
  const teamInbox = process.env.FYNIX_TEAM_EMAIL;
  if (teamInbox === undefined || teamInbox.trim() === "") {
    console.error("FYNIX_TEAM_EMAIL is not set, so nobody was told about a new lead.", { leadId });
    return;
  }

  try {
    await createAppEmailTransport(getPublicDb()).send(
      leadReceivedEmail({
        to: teamInbox,
        name: lead.name,
        businessName: lead.businessName,
        businessType: businessTypeLabel(lead.businessType),
        email: lead.email,
        phone: displayPhone(lead.phone).text,
        message: lead.message,
        leadUrl: new URL(`/leads/${leadId}`, serverEnv().ADMIN_ORIGIN).toString(),
      }),
    );
  } catch (error) {
    console.error("A lead was saved but the team notification failed.", { leadId, error });
  }
}
