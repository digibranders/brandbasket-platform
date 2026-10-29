"use server";

import { refresh } from "next/cache";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb } from "@/lib/server/db";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { removeBrandImage, type MediaActionResult } from "@/lib/server/onboarding-media";

/** Removes one logo or photo of the business. Uploads go to the /api/brand-assets route handler instead, to keep actions' 1 MB body limit. */
export async function removeBrandAssetAction(mediaId: string): Promise<MediaActionResult> {
  const { tenant } = await requireCustomerAccess();
  if (typeof mediaId !== "string") return { ok: false, message: "Reload the page and try again." };
  const result = await removeBrandImage({ appDb: getAppDb(), storage: getMediaStorage() }, tenant, mediaId);
  refresh();
  return result;
}
