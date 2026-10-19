// Types only from the database: this module reaches client components, and the package index pulls in the database.
import type { DirectoryVideo } from "@brandbasket/db";
import { VIDEO_SLOTS, type VideoSlot } from "@brandbasket/shared/lib/directory/videos";

/*
 * What the Photos tab says about a business's videos (docs/superpowers/specs/2026-10-07-business-videos-design.md), worked
 * out from its rows and kept free of the database and the DOM so it can be tested.
 */

/** What a business may do about videos: add them, or why not. */
export type VideoAccess = "ok" | "not-member" | "no-listing";

/**
 * Videos are a Premium member's (a website client), and need a listing that is not refused for them to show on. A free
 * listing account is not a member however its listing stands.
 */
export function videoAccessOf(kind: "website" | "listing", claimStatus: "pending" | "approved" | "rejected" | null): VideoAccess {
  if (kind !== "website") return "not-member";
  if (claimStatus === null || claimStatus === "rejected") return "no-listing";
  return "ok";
}

/**
 * Where a slot stands: `empty`; `live`, the video on the page; or `preparing`, an upload that has been asked for and is
 * on its way to Vimeo or being got ready by it (an older video of the slot may still be live meanwhile). A video needs
 * no approval from us, so there is nothing else in between.
 */
export type VideoState = "empty" | "live" | "preparing";

export interface VideoTile {
  readonly slot: VideoSlot;
  /** The live video of the slot, or null. */
  readonly video: DirectoryVideo | null;
  /** The upload in progress for the slot, or null. */
  readonly pending: DirectoryVideo | null;
  readonly state: VideoState;
}

export type VideosView =
  /** A free listing account: Videos are part of Premium. */
  | { readonly kind: "locked" }
  /** A member whose listing is missing or refused: nothing for a video to show on. */
  | { readonly kind: "needs-listing" }
  | { readonly kind: "tiles"; readonly tiles: readonly VideoTile[] };

/** What the Videos section shows, from the rows and what the business may do. */
export function videoTiles(videos: readonly DirectoryVideo[], access: VideoAccess): VideosView {
  if (access === "not-member") return { kind: "locked" };
  if (access === "no-listing") return { kind: "needs-listing" };
  const tiles = VIDEO_SLOTS.map((slot): VideoTile => {
    const video = videos.find((candidate) => candidate.slot === slot && candidate.status === "approved") ?? null;
    const pending = videos.find((candidate) => candidate.slot === slot && candidate.status !== "approved") ?? null;
    return { slot, video, pending, state: pending !== null ? "preparing" : video !== null ? "live" : "empty" };
  });
  return { kind: "tiles", tiles };
}

/** What a tile says about where its video stands, in the owner's words. */
export function videoStatusText(state: VideoState): string {
  switch (state) {
    case "live":
      return "Live on your page.";
    case "preparing":
      return "Getting it ready. It shows on your page in a minute or two.";
    case "empty":
      return "";
  }
}

/** A video's length as minutes and seconds, to the nearest second: "0:16". */
export function formatVideoDuration(durationMs: number): string {
  const total = Math.round(durationMs / 1000);
  const minutes = Math.floor(total / 60);
  const seconds = total % 60;
  return `${String(minutes)}:${String(seconds).padStart(2, "0")}`;
}
