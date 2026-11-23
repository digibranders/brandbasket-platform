import "server-only";
import { findLead, findUserIdByEmail, isBillingStarted, listConsents, listLeadInvites } from "@brandbasket/db";
import type { ReactNode } from "react";
import { z } from "zod";
import { toEnquiryRow, type EnquiryRow } from "@/lib/enquiries-model";
import { getStaffDb } from "@/lib/server/db";
import { reportServerError } from "@/lib/server/error-report";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { EnquiryDetail } from "./enquiry-detail";

export interface OpenEnquiry {
  readonly openId: string | null;
  readonly openRow: EnquiryRow | null;
  readonly detail: ReactNode;
  /** Set when the enquiry in `?open=` exists but could not be read, so the panel can say so and offer Try again. */
  readonly detailFailedFor: string | null;
}

const NOTHING: OpenEnquiry = { openId: null, openRow: null, detail: null, detailFailedFor: null };

/** The enquiry named in `?open=`, loaded for the side panel. Opening it is logged as a view, as the old detail page did. */
export async function loadOpenEnquiry(input: { readonly raw: string | string[] | undefined; readonly staffUserId: string; readonly now: Date }): Promise<OpenEnquiry> {
  const parsed = z.uuid().safeParse(Array.isArray(input.raw) ? input.raw[0] : input.raw);
  if (!parsed.success) return NOTHING;
  const leadId = parsed.data;
  const db = getStaffDb();
  try {
    const lead = await findLead(db, leadId);
    if (lead === null) return NOTHING;
    await logStaffAccess({ staffUserId: input.staffUserId, action: "lead.view", targetType: "lead", targetId: leadId });
    const [invites, consents, strandedAccount, currencyLocked] = await Promise.all([
      listLeadInvites(db, lead.id),
      listConsents(db, { type: "lead", ref: lead.id }),
      lead.businessId === null ? findUserIdByEmail(db, lead.email) : Promise.resolve(null),
      lead.businessId === null ? Promise.resolve(false) : isBillingStarted(db, lead.businessId),
    ]);
    const consent = [...consents].reverse().find((entry) => entry.purpose === "lead_contact" && entry.event === "given") ?? null;
    return {
      openId: leadId,
      openRow: toEnquiryRow(lead, input.now),
      detail: <EnquiryDetail lead={lead} invites={invites} consent={consent} strandedAccount={strandedAccount !== null} currencyLocked={currencyLocked} now={input.now} />,
      detailFailedFor: null,
    };
  } catch (error) {
    try {
      await reportServerError(error, { app: "admin", operation: "server_render", route: "/leads", userId: input.staffUserId });
    } catch {
      /* The panel says it could not load and offers Try again, whether or not monitoring is up. */
    }
    return { ...NOTHING, openId: leadId, detailFailedFor: leadId };
  }
}
