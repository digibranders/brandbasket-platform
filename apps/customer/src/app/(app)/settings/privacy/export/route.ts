import { accountExportResponse } from "@/features/settings/server/export-download";

export const dynamic = "force-dynamic";

/**
 * `GET /settings/privacy/export`: the signed-in person's own data as a JSON download. The old address, kept for bookmarks.
 * It answers from the session itself rather than a page guard: signed out is a bare 401 (not a redirect, which a download
 * link would save as a login page), and an account that has asked to be deleted may still download its data.
 */
export async function GET(): Promise<Response> {
  return accountExportResponse();
}
