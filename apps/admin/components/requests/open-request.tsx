import "server-only";
import { countIncludedEdits } from "@brandbasket/db";
import { monthBoundsIst } from "@brandbasket/shared/lib/change-requests";
import type { ReactNode } from "react";
import { z } from "zod";
import { getStaffDb } from "@/lib/server/db";
import { reportServerError } from "@/lib/server/error-report";
import { requestPricing } from "@/lib/server/request-pricing";
import { loadRequestDetail, type RequestDetail } from "@/lib/server/requests-view";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { ChangeMoves } from "./change-moves";

export interface OpenRequest {
  readonly openId: string | null;
  readonly detail: RequestDetail | null;
  /** Set when the ticket in `?open=` exists but could not be read, so the panel can say so and offer Try again. */
  readonly detailFailedFor: string | null;
  readonly changeSlot: ReactNode;
}

const NOTHING: OpenRequest = { openId: null, detail: null, detailFailedFor: null, changeSlot: null };

/**
 * The request named in `?open=`, loaded for the side panel: its thread, and for a change request the moves staff can make. A
 * request of another business than `onlyBusinessId` is treated as not found, so a client's tab never opens someone else's.
 */
export async function loadOpenRequest(input: { readonly raw: string | string[] | undefined; readonly staffUserId: string; readonly onlyBusinessId?: string }): Promise<OpenRequest> {
  const parsed = z.uuid().safeParse(Array.isArray(input.raw) ? input.raw[0] : input.raw);
  if (!parsed.success) return NOTHING;
  const ticketId = parsed.data;
  const db = getStaffDb();
  const now = new Date();
  try {
    const loaded = await loadRequestDetail(db, { ticketId, viewerId: input.staffUserId, now });
    if (loaded === null || (input.onlyBusinessId !== undefined && loaded.detail.businessId !== input.onlyBusinessId)) return NOTHING;
    await logStaffAccess({ staffUserId: input.staffUserId, action: "support_ticket.view", targetType: "support_ticket", targetId: ticketId });
    const { detail, change } = loaded;
    if (change === null) return { openId: ticketId, detail, detailFailedFor: null, changeSlot: null };
    const [pricing, used] = await Promise.all([requestPricing(db, change.businessId, now), countIncludedEdits(db, change.businessId, monthBoundsIst(now))]);
    return { openId: ticketId, detail, detailFailedFor: null, changeSlot: <ChangeMoves change={change} requesterName={detail.requester?.name ?? "the customer"} pricing={pricing} includedUsed={used} /> };
  } catch (error) {
    try {
      await reportServerError(error, { app: "admin", operation: "server_render", route: "/support", userId: input.staffUserId });
    } catch {
      /* The panel says it could not load and offers Try again, whether or not monitoring is up. */
    }
    return { ...NOTHING, openId: ticketId, detailFailedFor: ticketId };
  }
}
