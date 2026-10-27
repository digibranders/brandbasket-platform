import "server-only";
import { findLatestProject, findPreviewImageInfo, withCustomerRole, type Project } from "@brandbasket/db";
import { getStaffDb } from "./db";

export interface WebsiteBuild {
  readonly project: Project | null;
  /** The link the stored picture was taken of, and when. Null when there is none. */
  readonly picture: { readonly previewUrl: string; readonly capturedAt: Date } | null;
}

/**
 * One business's latest project and preview picture. Both queries rely on row-level security to pick the business, so they
 * run as the customer role scoped to this business inside a staff transaction; on the plain staff connection they would
 * return another business's picture.
 */
export async function loadWebsiteBuild(businessId: string, staffId: string): Promise<WebsiteBuild> {
  return getStaffDb().transaction((tx) =>
    withCustomerRole(tx, { userId: staffId, businessId }, async (scoped) => ({
      project: await findLatestProject(scoped),
      picture: await findPreviewImageInfo(scoped),
    })),
  );
}
