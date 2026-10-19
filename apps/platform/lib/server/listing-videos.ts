import { deploymentBrandShortName } from "@brandbasket/shared/lib/deployment-brand";
import "server-only";
import {
  completeDirectoryVideo,
  consumeRateLimit,
  discardDirectoryVideo,
  findClaimForBusiness,
  findPendingDirectoryVideo,
  listDirectoryVideos,
  newDirectoryVideoId,
  removeDirectoryVideo,
  setFeaturedDirectoryVideo,
  startDirectoryVideo,
  withTenantScope,
  type CompletedDirectoryVideo,
  type CompleteDirectoryVideoOutcome,
  type Database,
  type DirectoryPictureStatus,
  type DirectoryVideo,
  type NewDirectoryVideo,
  type RateLimitRule,
  type SetFeaturedDirectoryVideoOutcome,
  type StartDirectoryVideoOutcome,
} from "@brandbasket/db";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { isVideoLengthAllowed, VIDEO_PREMIUM_MESSAGE, videoTooLongMessage, type VideoSlot } from "@brandbasket/shared/lib/directory/videos";
import { getVimeoClient, VimeoError, type VimeoClient } from "@brandbasket/shared/server/vimeo";
import { videoAccessOf, type VideoAccess } from "@/lib/videos-view";
import { getCustomerBusinessEntry, type GrantedCustomer } from "./customer-access";
import { getAppDb } from "./db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { retryMinutes, type UploadAllowance } from "./onboarding-media";

/*
 * A Premium member's videos, hosted on Vimeo (docs/superpowers/specs/2026-10-07-business-videos-design.md). The flow:
 *
 * 1. requestVideoUpload: the owner says how big the file is. We make an empty unlisted video on Vimeo, record a row
 *    waiting for its file, and hand the browser Vimeo's upload address. The browser sends the file to Vimeo itself.
 * 2. checkVideoProgress, asked again and again by the page: Vimeo is still receiving or preparing it, or it is ready.
 *    Ready, we check its length (16 seconds), and the video goes live in place of the slot's old one. A clip that is too
 *    long, or that Vimeo cannot read, is deleted from Vimeo and its row dropped.
 * 3. removeListingVideo: the owner removes it, the row goes and so does the video on Vimeo.
 *
 * Writes run on the staff connection, because the customer role may write nothing to directory_videos: the business id
 * comes only from the session. Deleting from Vimeo always happens after the database change and never stops it: a video
 * the page no longer shows is gone for the owner even if Vimeo could not be reached; the failure is logged.
 */

/** What the browser is told about a video. Vimeo's ids and hash stay on the server until it is live. */
export interface UploadedVideo {
  readonly id: string;
  readonly slot: VideoSlot;
  readonly status: DirectoryPictureStatus;
}

export type VideoUploadRefusal = "not-member" | "no-claim" | "unavailable" | "quota" | "failed";

export type VideoUploadOutcome =
  | { readonly ok: true; readonly video: UploadedVideo; readonly uploadLink: string }
  | { readonly ok: false; readonly refusal: VideoUploadRefusal; readonly message: string };

export type VideoProgress =
  | { readonly state: "uploading" | "preparing" }
  | { readonly state: "live"; readonly video: UploadedVideo }
  /** Given up for a reason the owner is told: too long, unreadable, no longer a member. */
  | { readonly state: "failed"; readonly message: string }
  /** Not waiting any more: another business's, already live, replaced or removed. */
  | { readonly state: "gone" };

export interface ListingVideoDeps {
  /** Null when no VIMEO_ACCESS_TOKEN is set: videos are then not available. */
  readonly vimeo: Pick<VimeoClient, "createUpload" | "getVideo" | "deleteVideo"> | null;
  readonly newId: () => string;
  readonly start: (input: NewDirectoryVideo) => Promise<StartDirectoryVideoOutcome>;
  readonly findPending: (businessId: string, videoId: string) => Promise<DirectoryVideo | null>;
  readonly complete: (input: CompletedDirectoryVideo) => Promise<CompleteDirectoryVideoOutcome>;
  readonly discard: (input: { readonly videoId: string; readonly businessId: string; readonly now: Date }) => Promise<string | null>;
  readonly remove: (input: { readonly businessId: string; readonly slot: VideoSlot; readonly now: Date }) => Promise<string[]>;
  readonly log: (message: string, error: unknown) => void;
}

/** The dependencies the routes use: the staff connection's writes and Vimeo. */
export function listingVideoDeps(staffDb: Database): ListingVideoDeps {
  return {
    vimeo: getVimeoClient(),
    newId: newDirectoryVideoId,
    start: (input) => startDirectoryVideo(staffDb, input),
    findPending: (businessId, videoId) => findPendingDirectoryVideo(staffDb, { businessId, videoId }),
    complete: (input) => completeDirectoryVideo(staffDb, input),
    discard: (input) => discardDirectoryVideo(staffDb, input),
    remove: (input) => removeDirectoryVideo(staffDb, input),
    log: (message, error) => {
      console.error(`[fynix:videos] ${message}`, errorLogInfo(error));
    },
  };
}

export const VIDEO_UNAVAILABLE_MESSAGE = "Video uploads aren't available right now. Please try again later.";
const NO_CLAIM_MESSAGE = "Add your listing first, then your videos can show on its page.";
const QUOTA_MESSAGE = "Video uploads are very busy right now. Please try again in a few days.";
const START_FAILED_MESSAGE = "We couldn't start that upload. Please try again.";
const UNPROCESSABLE_MESSAGE = "We couldn't process that video. Please try another file, an MP4 or MOV.";
/** An upload that has not finished after this long is given up the next time its business starts one. */
const STALE_UPLOAD_MS = 60 * 60_000;
/** Vimeo's own title for the video, which only we see. */
const NAME_MAX = 100;

/**
 * Whether the business may add videos, from one indexed read each of its kind and listing: done before anything is
 * created on Vimeo or its budget spent. The database write checks again under a lock, so this is only an early answer.
 */
export async function videoUploadAccess(appDb: Database, tenant: TenantContext): Promise<VideoAccess> {
  const entry = await getCustomerBusinessEntry(tenant.userId, tenant.businessId);
  const claim = await withTenantScope(appDb, tenant, (tx) => findClaimForBusiness(tx, tenant.businessId));
  return videoAccessOf(entry.kind, claim === null ? null : claim.status);
}

/** Videos a business may start in an hour, whatever happens to them afterwards: each one makes a video on Vimeo. */
export const VIDEO_UPLOAD_RATE_LIMIT: RateLimitRule = { limit: 10, windowSeconds: 60 * 60 };

/** Spends one of the business's hourly video uploads. Every attempt that gets this far counts. */
export async function consumeVideoAllowance(appDb: Database, tenant: TenantContext): Promise<UploadAllowance> {
  const limit = await consumeRateLimit(appDb, `video-upload:business:${tenant.businessId}`, VIDEO_UPLOAD_RATE_LIMIT);
  if (limit.allowed) return { allowed: true };
  return {
    allowed: false,
    retryAfterSeconds: limit.retryAfterSeconds,
    message: `You've uploaded a lot of videos in the last hour. Try again in ${retryMinutes(limit.retryAfterSeconds)}.`,
  };
}

/** Deletes videos from Vimeo, each on its own: a failure is logged and never stops the rest or the caller. */
async function deleteFromVimeo(deps: ListingVideoDeps, vimeoIds: readonly string[]): Promise<void> {
  for (const vimeoId of vimeoIds) {
    try {
      if (deps.vimeo === null) throw new Error("No Vimeo access token is set.");
      await deps.vimeo.deleteVideo(vimeoId);
    } catch (error) {
      deps.log(`Could not delete Vimeo video ${vimeoId}.`, error);
    }
  }
}

function uploaded(video: DirectoryVideo): UploadedVideo {
  return { id: video.id, slot: video.slot, status: video.status };
}

/**
 * Step 1: makes the empty video on Vimeo and the row waiting for its file, and returns where the browser sends it. The
 * Vimeo video is made first, because its id is part of the row; if the row is then refused or fails, the video is deleted
 * again, so Vimeo never keeps an empty one we do not know about. The unfinished uploads the database gives up (the slot's
 * earlier one, and any older than an hour) are deleted from Vimeo too.
 */
export async function requestVideoUpload(
  deps: ListingVideoDeps,
  tenant: TenantContext,
  slot: VideoSlot,
  size: number,
  now: Date,
): Promise<VideoUploadOutcome> {
  if (deps.vimeo === null) return { ok: false, refusal: "unavailable", message: VIDEO_UNAVAILABLE_MESSAGE };

  let upload: Awaited<ReturnType<VimeoClient["createUpload"]>>;
  try {
    upload = await deps.vimeo.createUpload({ size, name: `${deploymentBrandShortName()} · ${tenant.businessName} · video ${String(slot)}`.slice(0, NAME_MAX) });
  } catch (error) {
    deps.log("Vimeo would not make an upload.", error);
    if (error instanceof VimeoError && error.reason === "quota") return { ok: false, refusal: "quota", message: QUOTA_MESSAGE };
    // A refused token, or no Fynix folder to file the video in: nothing is made, and the owner is told it is not available.
    if (error instanceof VimeoError && (error.reason === "unauthorized" || error.reason === "configuration")) {
      return { ok: false, refusal: "unavailable", message: VIDEO_UNAVAILABLE_MESSAGE };
    }
    return { ok: false, refusal: "failed", message: START_FAILED_MESSAGE };
  }

  let started: StartDirectoryVideoOutcome;
  try {
    started = await deps.start({
      id: deps.newId(),
      businessId: tenant.businessId,
      slot,
      vimeoId: upload.vimeoId,
      bytes: size,
      uploadedByUserId: tenant.userId,
      now,
      staleBefore: new Date(now.getTime() - STALE_UPLOAD_MS),
    });
  } catch (error) {
    await deleteFromVimeo(deps, [upload.vimeoId]);
    throw error;
  }
  if (started.kind === "not-member") {
    await deleteFromVimeo(deps, [upload.vimeoId]);
    return { ok: false, refusal: "not-member", message: VIDEO_PREMIUM_MESSAGE };
  }
  if (started.kind === "no-claim") {
    await deleteFromVimeo(deps, [upload.vimeoId]);
    return { ok: false, refusal: "no-claim", message: NO_CLAIM_MESSAGE };
  }

  await deleteFromVimeo(deps, started.staleVimeoIds);
  return { ok: true, video: uploaded(started.video), uploadLink: upload.uploadLink };
}

/** Gives up a waiting upload: its row goes, and so does the video on Vimeo (unless Vimeo no longer has it). */
async function giveUp(deps: ListingVideoDeps, tenant: TenantContext, row: DirectoryVideo, now: Date, alsoOnVimeo: boolean): Promise<void> {
  await deps.discard({ videoId: row.id, businessId: tenant.businessId, now });
  if (alsoOnVimeo) await deleteFromVimeo(deps, [row.vimeoId]);
}

/**
 * Step 2: where an upload stands, asked by the page until it is live or given up. A failure to reach Vimeo is thrown,
 * so the page just asks again a moment later with the row untouched. Safe to ask any number of times, from several
 * tabs: taking a video live is one locked write, and the second ask finds nothing waiting (`gone`).
 */
export async function checkVideoProgress(deps: ListingVideoDeps, tenant: TenantContext, videoId: string, now: Date): Promise<VideoProgress> {
  const row = await deps.findPending(tenant.businessId, videoId);
  if (row === null) return { state: "gone" };
  if (deps.vimeo === null) return { state: "failed", message: VIDEO_UNAVAILABLE_MESSAGE };

  const onVimeo = await deps.vimeo.getVideo(row.vimeoId);
  if (onVimeo === null) {
    await giveUp(deps, tenant, row, now, false);
    return { state: "failed", message: "That upload didn't arrive. Please try again." };
  }
  if (onVimeo.state === "uploading" || onVimeo.state === "preparing") return { state: onVimeo.state };
  if (onVimeo.state === "failed") {
    await giveUp(deps, tenant, row, now, true);
    return { state: "failed", message: UNPROCESSABLE_MESSAGE };
  }

  // Ready: Vimeo reports everything the page needs together (see VimeoClient.getVideo).
  const { seconds, width, height, hash, posterUrl } = onVimeo;
  if (seconds === null || width === null || height === null || hash === null || posterUrl === null) return { state: "preparing" };
  if (!isVideoLengthAllowed(seconds)) {
    await giveUp(deps, tenant, row, now, true);
    return { state: "failed", message: videoTooLongMessage(seconds) };
  }

  const done = await deps.complete({
    videoId: row.id,
    businessId: tenant.businessId,
    vimeoHash: hash,
    posterUrl,
    width,
    height,
    durationMs: Math.round(seconds * 1000),
    now,
  });
  if (done.kind === "not-found") return { state: "gone" };
  if (done.kind === "not-member") {
    await giveUp(deps, tenant, row, now, true);
    return { state: "failed", message: VIDEO_PREMIUM_MESSAGE };
  }
  await deleteFromVimeo(deps, done.replacedVimeoIds);
  return { state: "live", video: uploaded(done.video) };
}

/** Step 3: removes the business's video in `slot`: the row first, then the video on Vimeo. */
export async function removeListingVideo(deps: ListingVideoDeps, tenant: TenantContext, slot: VideoSlot, now: Date): Promise<void> {
  const vimeoIds = await deps.remove({ businessId: tenant.businessId, slot, now });
  await deleteFromVimeo(deps, vimeoIds);
}

/**
 * Chooses which one video is shown in the mosaic at the top of the business's page (null: none). Only the business's own
 * live video can be chosen; choosing one unsets the previous one. Runs on the staff connection after the platform has
 * checked the customer; the business id comes from the session.
 */
export async function setFeaturedListingVideo(staffDb: Database, tenant: TenantContext, videoId: string | null): Promise<SetFeaturedDirectoryVideoOutcome> {
  return setFeaturedDirectoryVideo(staffDb, { businessId: tenant.businessId, videoId });
}

/** The signed-in business's videos for the Photos page, read through its own tenant scope. */
export async function getOwnVideos(customer: Pick<GrantedCustomer, "tenant">): Promise<DirectoryVideo[]> {
  const { tenant } = customer;
  return withTenantScope(getAppDb(), tenant, (tx) => listDirectoryVideos(tx, tenant.businessId));
}
