import "server-only";
import { findClientDetail, type ClientDetail } from "@brandbasket/db";
import { notFound } from "next/navigation";
import { cache } from "react";
import type { ClientTabSlug } from "@/lib/client-tabs";
import { getStaffDb } from "./db";
import { requireStaffAccess, type GrantedStaff } from "./staff-access";
import { logStaffAccess } from "./staff-access-log";
import { requireStaffCan } from "./staff-role";

/** One read of the client per request, shared by the layout's header and the tab under it. Not found ends the request. */
export const loadClient = cache(async (businessId: string): Promise<ClientDetail> => {
  const client = await findClientDetail(getStaffDb(), businessId);
  if (client === null) notFound();
  return client;
});

/**
 * Opens one tab of a client's page: checks access (Billing needs money), records the view with the tab it was
 * (DPDP Rules 2025 r.6(1)(c)), then reads the client. Every tab page starts here.
 */
export async function openClientTab(
  businessId: string,
  tab: ClientTabSlug,
): Promise<{ readonly granted: GrantedStaff; readonly client: ClientDetail }> {
  const granted = tab === "billing" ? await requireStaffCan("money") : await requireStaffAccess();
  await logStaffAccess({
    staffUserId: granted.user.id,
    action: tab === "people" ? "client.people_view" : "client.view",
    targetType: "business",
    targetId: businessId,
    businessId,
    detail: tab === "" ? null : tab,
  });
  return { granted, client: await loadClient(businessId) };
}
