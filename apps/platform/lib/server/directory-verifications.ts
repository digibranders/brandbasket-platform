import "server-only";
import {
  answerByAsked,
  readClaimedWebsites,
  readDirectoryStatuses,
  readLiveDirectoryPictures,
  resolveDirectoryAsk,
  type DirectoryAsk,
} from "@brandbasket/db";
import { safeWebsiteHref } from "@brandbasket/shared/lib/safe-link";
import type { ListingStatus, StatusResponse } from "@/lib/directory-api";
import { getStaffDb } from "./db";

/**
 * The work behind `GET /api/directory/status`: which of a list page's businesses Brandbasket has verified, with the
 * confirmed number, the owner's approved photo and the owner's own website to show for each. Read on the staff connection (see `getStaffDb`'s
 * sanctioned exceptions): the verifications and pictures tables are not the website's to read, and the website's
 * shared secret has already been checked by the route. Each business is read once, by its place (or by its key, for a
 * key no place has), and answered under every id and key it was asked by.
 */
export async function readStatuses(ask: DirectoryAsk): Promise<StatusResponse> {
  const db = getStaffDb();
  const resolved = await resolveDirectoryAsk(db, ask);
  const [verified, pictures, websites] = await Promise.all([
    readDirectoryStatuses(db, resolved.lookup),
    readLiveDirectoryPictures(db, resolved.lookup),
    readClaimedWebsites(db, resolved.lookup),
  ]);
  const statuses: Record<string, ListingStatus> = {};
  for (const [asked, status] of answerByAsked(resolved, verified)) {
    const business = resolved.readAs.get(asked) ?? asked;
    const website = websites.get(business);
    statuses[asked] = {
      verifiedAt: status.verifiedAt.toISOString(),
      phone: status.phone,
      photo: pictures.get(business)?.listing ?? null,
      website: website === undefined ? null : safeWebsiteHref(website),
      trusted: status.trusted,
    };
  }
  return { statuses };
}
