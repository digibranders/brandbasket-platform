"use server";

import { takeDownDirectoryVideo } from "@fynix/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getVimeoClient, type VimeoClient } from "@fynix/shared/server/vimeo";
import { adsHref, parseAdsView, type AdsNotice, type AdsView } from "@/lib/ads-view";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess } from "@/lib/server/staff-access";

/*
 * The Videos list's action, beside the Ads page's other actions. Videos go live when their owner uploads them, so staff
 * have no approving to do: only taking one down. The row form posts the video's id and the view it was shown in, so the
 * redirect lands back on the same list with a one-line notice.
 */

const idSchema = z.uuid();

function readId(formData: FormData): string {
  const parsed = idSchema.safeParse(formData.get("id"));
  if (!parsed.success) throw new Error("The form must name a valid id.");
  return parsed.data;
}

function postedView(formData: FormData): AdsView {
  return parseAdsView((name) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  });
}

function back(view: AdsView, notice: AdsNotice): never {
  revalidatePath("/ads");
  redirect(adsHref(view, notice));
}

/**
 * Deletes the videos from Vimeo. The database change has already taken them off the page, so a failure here is logged and
 * never thrown, and one failing video does not stop the others; with no client configured there is nothing to delete with.
 */
async function deleteFromVimeo(vimeoIds: readonly string[]): Promise<void> {
  const client: VimeoClient | null = getVimeoClient();
  if (client === null) {
    console.warn("VIMEO_ACCESS_TOKEN is not set, so a taken-down video was left on Vimeo.", { vimeoIds });
    return;
  }
  for (const vimeoId of vimeoIds) {
    try {
      await client.deleteVideo(vimeoId);
    } catch (error) {
      console.error("Could not delete a taken-down video from Vimeo.", {
        vimeoId,
        error: error instanceof Error ? error.name : "unknown error",
      });
    }
  }
}

/** Takes a live video down, for one that should not be on a business's page: the page stops showing it and it is deleted from Vimeo. */
export async function takeDownVideoAction(formData: FormData): Promise<void> {
  await requireStaffAccess();
  const vimeoIds = await takeDownDirectoryVideo(getStaffDb(), readId(formData), new Date());
  if (vimeoIds.length > 0) await deleteFromVimeo(vimeoIds);
  back(postedView(formData), vimeoIds.length === 0 ? "unchanged" : "video_removed");
}
