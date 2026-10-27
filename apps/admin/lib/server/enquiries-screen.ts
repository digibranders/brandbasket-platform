import "server-only";
import { listAssignableSupportStaff, listLeads, type Lead } from "@brandbasket/db";
import { displayPhone } from "@brandbasket/shared/server/phone-display";
import { bucketOf, filterEnquiries, type EnquiryQuery } from "@/lib/enquiries";
import { getStaffDb } from "./db";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

/** What the search box matches: business, contact name, email, and the phone number both stored and as written. */
export function enquirySearchText(lead: Lead): string {
  return [lead.businessName, lead.name, lead.email, lead.phone ?? "", lead.phone === null ? "" : displayPhone(lead.phone).text].join(" ");
}

export interface EnquiryScreen {
  readonly all: readonly Lead[];
  readonly rows: readonly Lead[];
  readonly staff: readonly { readonly userId: string; readonly name: string }[];
  readonly ownerNames: ReadonlyMap<string, string>;
  readonly now: Date;
  readonly weekCount: number;
  readonly toContactCount: number;
}

/**
 * Everything the Enquiries list needs, for the list page, the open enquiry's page and the CSV export. Every lead is read
 * once and filtered here. shortcut: the whole table is read per page, move the filters into SQL when leads pass a few thousand.
 */
export async function loadEnquiryScreen(query: EnquiryQuery, staffUserId: string): Promise<EnquiryScreen> {
  const db = getStaffDb();
  const [all, staff] = await Promise.all([listLeads(db, {}), listAssignableSupportStaff(db)]);
  const now = new Date();
  return {
    all,
    rows: filterEnquiries(all, query, staffUserId, enquirySearchText),
    staff,
    ownerNames: new Map(staff.map((member) => [member.userId, member.name])),
    now,
    weekCount: all.filter((lead) => now.getTime() - lead.createdAt.getTime() < WEEK_MS).length,
    toContactCount: all.filter((lead) => bucketOf(lead.status) === "to_contact").length,
  };
}
