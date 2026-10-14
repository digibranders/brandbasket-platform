import "server-only";
import {
  beginSupportAccountErasure,
  eraseClosedAccount,
  findClosureDueForErasure,
  findErasureBlock,
  listClosuresDueForErasure,
  markSupportAttachmentPurged,
} from "@fynix/db";
import { deleteMediaFilesReporting, getMediaStorage } from "@fynix/shared/server/media-storage";
import { purgeSupportAttachments } from "@fynix/shared/server/support-attachment-maintenance";
import { getSupportStorage } from "@fynix/shared/server/support-storage";
import { eraseAccountWithPrivateSupport } from "./support-account-erasure";
import { getVimeoClient } from "@fynix/shared/server/vimeo";
import { getPayload } from "payload";
import config from "@/payload.config";
import type { ErasureDeps } from "@/lib/account-erasure-run";
import { getStaffDb } from "./db";

/**
 * The website CMS's collections that hold a business's content, children before what they point at: posts name an
 * author, a category and a cover image, authors name a photo.
 */
const CMS_COLLECTIONS = [
  "blogPosts",
  "blogAuthors",
  "blogCategories",
  "media",
  "tenants",
] as const;

/**
 * Removes everything the CMS (its own database, outside packages/db) holds for a business, files included. Deleting a
 * collection's documents by `businessId` that are already gone is a no-op, so running it twice is harmless. Payload's
 * bulk delete reports per-document failures in `errors` instead of throwing, which would look like success.
 */
async function eraseWebsiteContent(businessId: string): Promise<void> {
  const payload = await getPayload({ config });
  for (const collection of CMS_COLLECTIONS) {
    const result = await payload.delete({
      collection,
      where: { businessId: { equals: businessId } },
      overrideAccess: true,
    });
    if (result.errors.length > 0) {
      throw new Error(
        `The CMS could not delete ${result.errors.length} ${collection} document(s) for a business.`,
      );
    }
  }
}

/** The real thing the 30-day erase runs against: the staff database, the CMS and the media storage. */
export function realErasureDeps(): ErasureDeps {
  const staffDb = getStaffDb();
  return {
    listDue: (now, limit) => listClosuresDueForErasure(staffDb, now, limit),
    findBlock: (closureId, now) =>
      findErasureBlock(staffDb, { closureId, now }),
    eraseWebsiteContent,
    eraseRows: (closureId, now) =>
      eraseAccountWithPrivateSupport(
        {
          findClosure: (id, at) => findClosureDueForErasure(staffDb, id, at),
          findBlock: (id, at) =>
            findErasureBlock(staffDb, { closureId: id, now: at }),
          begin: (userId) => beginSupportAccountErasure(staffDb, userId),
          purge: (rows) =>
            purgeSupportAttachments(
              {
                storage: getSupportStorage(),
                markPurged: (id) => markSupportAttachmentPurged(staffDb, id),
                onError: (id, error) =>
                  console.error(
                    "Could not purge private support screenshot; account erasure will retry",
                    { attachmentId: id, error },
                  ),
              },
              rows,
            ),
          erase: (id, at) =>
            eraseClosedAccount(staffDb, { closureId: id, now: at }),
        },
        closureId,
        now,
      ),
    // A picture's smaller copies go with it, so an erased account leaves no copy of any picture behind.
    deleteFiles: async (keys) => [...(await deleteMediaFilesReporting(getMediaStorage(), keys))],
    deleteVimeoVideos: async (ids) => {
      if (ids.length === 0) return [];
      const vimeo = getVimeoClient();
      if (vimeo === null) {
        console.error("Could not delete an erased account's videos from Vimeo: no VIMEO_ACCESS_TOKEN is set", { videos: ids.length });
        return [...ids];
      }
      const failed: string[] = [];
      for (const id of ids) {
        try {
          await vimeo.deleteVideo(id);
        } catch (error) {
          console.error("Could not delete a video from Vimeo", { id, error });
          failed.push(id);
        }
      }
      return failed;
    },
  };
}
