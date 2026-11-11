import "server-only";
import { listFeedbackForProject, listPreviewVersions } from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import type { SentChanges, SentVersion } from "@/lib/website/history";
import { getStaffDb } from "./db";

/**
 * Every preview sent on the project, newest first. Staff connection, because customers have no grant on
 * project_preview_versions (see lib/server/db.ts). The business comes from the session; the project is the one the page
 * already read under the customer's own scope, and the query matches both, so another business's project finds nothing.
 */
export async function loadPreviewVersions(tenant: TenantContext, projectId: string): Promise<readonly SentVersion[]> {
  const rows = await listPreviewVersions(getStaffDb(), { projectId, businessId: tenant.businessId });
  return rows.map((row): SentVersion => ({ version: row.version, url: row.previewUrl, sentAt: row.sentAt }));
}

/**
 * The rounds of changes the customer sent on the project, newest first, with what they wrote. Staff connection, because
 * project_feedback_tickets has no customer grant; the ticket itself is the customer's own request. Same scoping as above.
 */
export async function loadSentChanges(tenant: TenantContext, projectId: string): Promise<readonly SentChanges[]> {
  const rows = await listFeedbackForProject(getStaffDb(), { projectId, businessId: tenant.businessId });
  return rows.map((row): SentChanges => ({ ticketId: row.ticketId, round: row.round, body: row.body, sentAt: row.createdAt }));
}
