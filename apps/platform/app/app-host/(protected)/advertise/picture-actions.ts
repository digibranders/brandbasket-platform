"use server";

import { redirect } from "next/navigation";
import { parsePictureKind } from "@fynix/shared/lib/directory/pictures";
import { getMediaStorage } from "@fynix/shared/server/media-storage";
import type { AdvertiseNotice } from "@/lib/advertise-notices";
import { ADVERTISE_PATH, requireCustomerAccess } from "@/lib/server/customer-access";
import { getStaffDb } from "@/lib/server/db";
import { removeListingPictures } from "@/lib/server/listing-pictures";

function back(notice: AdvertiseNotice): never {
  redirect(`${ADVERTISE_PATH}?notice=${notice}`);
}

/**
 * Removes the ad picture in both its shapes, whatever is live and whatever is waiting, from the Advertise page. The
 * featured photo is removed from the Business profile (removePhotoAction).
 */
export async function removeAdPictureAction(formData: FormData): Promise<void> {
  const customer = await requireCustomerAccess({ listingAccount: "allow", plan: "premium" });
  if (parsePictureKind(formData.get("kind")) !== "ad") back("picture-invalid");
  await removeListingPictures({ staffDb: getStaffDb(), storage: getMediaStorage() }, customer.tenant, "ad", new Date());
  back("picture-removed");
}
