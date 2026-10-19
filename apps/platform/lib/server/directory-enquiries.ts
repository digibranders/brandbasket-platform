import "server-only";
import {
  consumeRateLimit,
  findListingOwner,
  insertDirectoryEnquiry,
  recordConsent,
  resolveDirectoryNamed,
  type Database,
  type DirectoryRef,
  type NewDirectoryEnquiry,
  type RateLimitRule,
} from "@brandbasket/db";
import { listingEnquiryEmail } from "@brandbasket/email";
import { displayPhone } from "@brandbasket/shared/server/phone-display";
import { LEADS_PATH } from "@/lib/leads";
import { getStaffDb } from "./db";
import { customerEmailTransport } from "./email";
import type { EnquiryInput } from "./directory-fields";
import { serverEnv } from "./env";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { ipRateLimitKey } from "./ip-key";

/**
 * The work behind `POST /api/directory/enquiries`: "Send enquiry" on a directory card or business page, and the list
 * page's "Get the list of top …" form. No code confirms an enquiry (like the website's Get started form), so the rate
 * limits are what hold back a flood. Stored on the staff connection (see `getStaffDb`'s sanctioned exceptions), for
 * Fynix staff to read in the console and pass on. An enquiry to a business whose owner has an account is also
 * emailed to that owner, and listed on their dashboard.
 */

const ONE_HOUR_SECONDS = 60 * 60;
const ONE_DAY_SECONDS = 24 * ONE_HOUR_SECONDS;

/** Per visitor address: enough for a family sharing one connection. */
const IP_RULE: RateLimitRule = { limit: 6, windowSeconds: ONE_HOUR_SECONDS };
/** Per phone number, whatever address it comes from. */
const PHONE_RULE: RateLimitRule = { limit: 10, windowSeconds: ONE_DAY_SECONDS };
/** Every enquiry together: the address is only as honest as the website that forwarded it. */
const ALL_RULE: RateLimitRule = { limit: 120, windowSeconds: ONE_HOUR_SECONDS };

/** `unknown_business`: the enquiry names an id no business on the platform has. */
export type EnquiryOutcome = "received" | "unknown_business" | "limited" | "failed";


/**
 * Emails the enquiry to the business's owner, when the listing has one on Fynix whose address is confirmed. An
 * unowned listing's enquiries stay with staff, who pass them on. The enquiry is already saved by this point, so a
 * failure here is logged and never shown to the visitor.
 */
async function tellOwner(enquiry: Extract<NewDirectoryEnquiry, { kind: "business" }>): Promise<void> {
  try {
    const owner = await findListingOwner(getStaffDb(), enquiry.business);
    if (owner === null || !owner.emailConfirmed) return;
    await customerEmailTransport(getStaffDb()).send(
      listingEnquiryEmail({
        to: owner.ownerEmail,
        businessName: enquiry.businessName,
        visitorName: enquiry.name,
        visitorPhone: displayPhone(enquiry.phone).text,
        message: enquiry.message,
        // Every kind of owner reads them on the one Leads page (app/app-host/(protected)/leads).
        dashboardUrl: new URL(LEADS_PATH, serverEnv().APP_ORIGIN).toString(),
      }),
    );
  } catch (error) {
    console.error("An enquiry was saved but its owner could not be told.", { business: businessLabel(enquiry.business), ...errorLogInfo(error) });
  }
}

/**
 * Keeps proof of the notice the visitor saw when they sent the enquiry (DPDP Act s.5, r.3), against the enquiry itself:
 * an enquirer has no account. The enquiry is already saved, so a failure here is logged and never shown to the visitor.
 */
async function keepNoticeProof(db: Database, enquiryId: string, noticeVersion: string): Promise<void> {
  try {
    await recordConsent(db, { subject: { type: "enquiry", ref: enquiryId }, purpose: "directory_enquiry", noticeVersion, channel: "web" });
  } catch (error) {
    console.error("A directory enquiry's consent record could not be written.", { enquiryId, ...errorLogInfo(error) });
  }
}

/** The id or key a business is stored under: public data, safe to log. */
function businessLabel(business: DirectoryRef): string {
  return business.placeId === null ? business.listingKey : business.placeId;
}

/** The id or key an enquiry named its business by, for the logs. */
function namedLabel(input: EnquiryInput): string | null {
  if (input.business === null) return null;
  return input.business.by === "id" ? input.business.id : input.business.key;
}

/**
 * Stores a visitor's enquiry for staff, after finding the business it names (an id no business has is refused before
 * any rate limit is spent) and within the rate limits; a business enquiry is also emailed to the business's owner.
 */
export async function recordDirectoryEnquiry(input: EnquiryInput, clientIp: string, now: Date): Promise<EnquiryOutcome> {
  try {
    const db = getStaffDb();
    let enquiry: NewDirectoryEnquiry;
    if (input.kind === "business") {
      const business = await resolveDirectoryNamed(db, input.business);
      if (business === null) return "unknown_business";
      enquiry = { ...input, business };
    } else {
      enquiry = input;
    }
    for (const check of [
      { key: `dir-enquiry:ip:${ipRateLimitKey(clientIp)}`, rule: IP_RULE },
      { key: `dir-enquiry:phone:${enquiry.phone}`, rule: PHONE_RULE },
      { key: "dir-enquiry:all", rule: ALL_RULE },
    ]) {
      const result = await consumeRateLimit(db, check.key, check.rule, now);
      if (!result.allowed) return "limited";
    }
    const enquiryId = await insertDirectoryEnquiry(db, enquiry);
    if (input.noticeVersion !== undefined) await keepNoticeProof(db, enquiryId, input.noticeVersion);
    if (enquiry.kind === "business") await tellOwner(enquiry);
    return "received";
  } catch (error) {
    // Never the error's message: a failed insert's parameters (name, phone, message) would be in it.
    console.error("Could not record a directory enquiry.", { business: namedLabel(input), ...errorLogInfo(error) });
    return "failed";
  }
}
