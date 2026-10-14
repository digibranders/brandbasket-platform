import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Database } from "../client";
import {
  businesses,
  directoryClaims,
  directoryVideos,
  type DirectoryClaimStatus,
  type DirectoryPictureStatus,
  type DirectoryVideoSlot,
} from "../schema";
import type { ScopedTransaction } from "../scope";
import { directoryBusinessOf, isEmptyDirectoryLookup, matchesDirectoryLookup, type DirectoryLookup } from "./directory-refs";
import { isUuid } from "./tenant";

type Runner = Database | ScopedTransaction;

/*
 * A Premium member's videos (docs/superpowers/specs/2026-10-07-business-videos-design.md), hosted on Vimeo. The customer
 * reads its own rows through row-level security; everything that writes runs on the staff connection after the
 * platform has checked the customer or the staff member.
 *
 * A video's life: the owner asks to upload (`startDirectoryVideo`: a row waiting for its file, and a Vimeo video id),
 * the browser sends the file to Vimeo, and once Vimeo has prepared it and the platform has checked its length
 * (`completeDirectoryVideo`) it is live, replacing the slot's old video. Nobody approves it; staff can take one down.
 * Every write that drops a video returns its Vimeo id, for the caller to delete it from Vimeo once the transaction has
 * committed.
 */

/** The row's id exists before the file does: the dashboard names the row while the upload is on its way. */
export function newDirectoryVideoId(): string {
  return uuidv7();
}

export interface DirectoryVideo {
  readonly id: string;
  readonly businessId: string;
  readonly slot: DirectoryVideoSlot;
  /** `pending` while it uploads and is prepared; `approved` once it is live. */
  readonly status: DirectoryPictureStatus;
  readonly vimeoId: string;
  readonly vimeoHash: string | null;
  readonly posterUrl: string | null;
  readonly width: number | null;
  readonly height: number | null;
  readonly durationMs: number | null;
  readonly bytes: number;
  /** The one video the owner chose to show in the mosaic at the top of the page. */
  readonly featured: boolean;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
}

const VIDEO_COLUMNS = {
  id: directoryVideos.id,
  businessId: directoryVideos.businessId,
  slot: directoryVideos.slot,
  status: directoryVideos.status,
  vimeoId: directoryVideos.vimeoId,
  vimeoHash: directoryVideos.vimeoHash,
  posterUrl: directoryVideos.posterUrl,
  width: directoryVideos.width,
  height: directoryVideos.height,
  durationMs: directoryVideos.durationMs,
  bytes: directoryVideos.bytes,
  featured: directoryVideos.featured,
  createdAt: directoryVideos.createdAt,
  decidedAt: directoryVideos.decidedAt,
} as const;

/** The columns a video's business is found by: its owner's claim. */
const CLAIM_BUSINESS = { placeId: directoryClaims.placeId, listingKey: directoryClaims.listingKey } as const;

/** The business's videos that have not been removed, oldest first: at most one live and one being prepared per slot. Works through row-level security (the Photos page) and on staff. */
export async function listDirectoryVideos(db: Runner, businessId: string): Promise<DirectoryVideo[]> {
  return db
    .select(VIDEO_COLUMNS)
    .from(directoryVideos)
    .where(and(eq(directoryVideos.businessId, businessId), isNull(directoryVideos.removedAt)))
    .orderBy(asc(directoryVideos.createdAt), asc(directoryVideos.id));
}

/** The business's video that is still waiting for its file or for Vimeo, or null: another business's id, a live or removed video, and anything that is not a UUID are all not found. */
export async function findPendingDirectoryVideo(
  db: Runner,
  input: { readonly businessId: string; readonly videoId: string },
): Promise<DirectoryVideo | null> {
  if (!isUuid(input.videoId)) return null;
  const rows = await db
    .select(VIDEO_COLUMNS)
    .from(directoryVideos)
    .where(
      and(
        eq(directoryVideos.id, input.videoId),
        eq(directoryVideos.businessId, input.businessId),
        ne(directoryVideos.status, "approved"),
        isNull(directoryVideos.removedAt),
      ),
    )
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Locks the business's claim row for the rest of the transaction and returns its status, or null when it has no claim.
 * Every write to a business's videos takes this first, so a start, a completion and a removal for one business run one
 * after the other and never wait on each other's video rows in opposite orders.
 */
async function lockClaimForVideos(tx: ScopedTransaction, businessId: string): Promise<DirectoryClaimStatus | null> {
  const claims = await tx
    .select({ status: directoryClaims.status })
    .from(directoryClaims)
    .where(eq(directoryClaims.businessId, businessId))
    .limit(1)
    .for("update");
  return claims[0]?.status ?? null;
}

/** Whether the business is a Premium member (a website client). */
async function isMember(tx: ScopedTransaction, businessId: string): Promise<boolean> {
  const owners = await tx.select({ kind: businesses.kind }).from(businesses).where(eq(businesses.id, businessId)).limit(1);
  return owners[0]?.kind === "website";
}

export interface NewDirectoryVideo {
  /** From newDirectoryVideoId(). */
  readonly id: string;
  readonly businessId: string;
  readonly slot: DirectoryVideoSlot;
  /** Vimeo's id for the video it just created for this upload. */
  readonly vimeoId: string;
  /** The size the owner said the file would be, in bytes. */
  readonly bytes: number;
  readonly uploadedByUserId: string;
  readonly now: Date;
  /** Uploads of this business that were started before this moment and never finished are given up. */
  readonly staleBefore: Date;
}

export type StartDirectoryVideoOutcome =
  | {
      readonly kind: "started";
      readonly video: DirectoryVideo;
      /** Vimeo ids of unfinished uploads given up now (the slot's earlier one, and any older than `staleBefore`): delete them from Vimeo. */
      readonly staleVimeoIds: readonly string[];
    }
  /** Videos are a Premium member's: the business is not a website client (a free listing account, or no such business). */
  | { readonly kind: "not-member" }
  /** A member with nothing for a video to show on: no listing yet, or its claim was rejected. */
  | { readonly kind: "no-claim" };

/**
 * Records that the owner is about to upload a video for a slot. The live video of the slot stays up while the new one
 * is on its way. An earlier unfinished upload in the same slot is given up, and so is any of the business's others that
 * is older than `staleBefore`, because Vimeo keeps an empty placeholder for each one. Staff connection only, after the
 * platform has checked the customer. The membership is checked here too, under the lock, so a business that stopped
 * being a member cannot start one.
 */
export async function startDirectoryVideo(db: Database, input: NewDirectoryVideo): Promise<StartDirectoryVideoOutcome> {
  if (!isUuid(input.id)) throw new Error(`Directory video id must be a UUID, received "${input.id}"`);
  return db.transaction(async (tx) => {
    const claimStatus = await lockClaimForVideos(tx, input.businessId);
    if (!(await isMember(tx, input.businessId))) return { kind: "not-member" };
    if (claimStatus === null || claimStatus === "rejected") return { kind: "no-claim" };

    const unfinished = and(
      eq(directoryVideos.businessId, input.businessId),
      ne(directoryVideos.status, "approved"),
      isNull(directoryVideos.removedAt),
    );
    const given = await tx
      .select({ id: directoryVideos.id, slot: directoryVideos.slot, createdAt: directoryVideos.createdAt, vimeoId: directoryVideos.vimeoId })
      .from(directoryVideos)
      .where(unfinished);
    const giveUp = given.filter((row) => row.slot === input.slot || row.createdAt < input.staleBefore);
    if (giveUp.length > 0) {
      await tx
        .update(directoryVideos)
        .set({ removedAt: input.now })
        .where(
          inArray(
            directoryVideos.id,
            giveUp.map((row) => row.id),
          ),
        );
    }

    const rows = await tx
      .insert(directoryVideos)
      .values({
        id: input.id,
        businessId: input.businessId,
        slot: input.slot,
        vimeoId: input.vimeoId,
        bytes: input.bytes,
        uploadedByUserId: input.uploadedByUserId,
        createdAt: input.now,
      })
      .returning(VIDEO_COLUMNS);
    const video = rows[0];
    if (video === undefined) throw new Error("Directory video insert returned no row");
    return { kind: "started", video, staleVimeoIds: giveUp.map((row) => row.vimeoId) };
  });
}

export interface CompletedDirectoryVideo {
  readonly videoId: string;
  readonly businessId: string;
  /** The privacy hash in the video's embed address, as Vimeo reported it. */
  readonly vimeoHash: string;
  readonly posterUrl: string;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  readonly now: Date;
}

export type CompleteDirectoryVideoOutcome =
  | {
      readonly kind: "live";
      readonly video: DirectoryVideo;
      /** Vimeo ids of the videos this one replaced in its slot: delete them from Vimeo. */
      readonly replacedVimeoIds: readonly string[];
    }
  /** No such upload is waiting: it was given up, replaced, removed, or is already live. */
  | { readonly kind: "not-found" }
  /** The business stopped being a Premium member while its video was being prepared. */
  | { readonly kind: "not-member" };

/**
 * Takes an upload live once Vimeo has prepared it and its length has been checked. It is recorded as approved by its
 * uploader, and takes the place of the slot's live video, whose Vimeo id is returned. Staff connection only, after the
 * platform has checked the customer.
 */
export async function completeDirectoryVideo(db: Database, input: CompletedDirectoryVideo): Promise<CompleteDirectoryVideoOutcome> {
  if (!isUuid(input.videoId)) return { kind: "not-found" };
  return db.transaction(async (tx) => {
    await lockClaimForVideos(tx, input.businessId);
    const waiting = await tx
      .select({ slot: directoryVideos.slot, uploadedByUserId: directoryVideos.uploadedByUserId })
      .from(directoryVideos)
      .where(
        and(
          eq(directoryVideos.id, input.videoId),
          eq(directoryVideos.businessId, input.businessId),
          ne(directoryVideos.status, "approved"),
          isNull(directoryVideos.removedAt),
        ),
      )
      .limit(1)
      .for("update");
    const row = waiting[0];
    if (row === undefined) return { kind: "not-found" };
    if (!(await isMember(tx, input.businessId))) return { kind: "not-member" };

    const replaced = await tx
      .update(directoryVideos)
      .set({ removedAt: input.now })
      .where(
        and(
          eq(directoryVideos.businessId, input.businessId),
          eq(directoryVideos.slot, row.slot),
          eq(directoryVideos.status, "approved"),
          isNull(directoryVideos.removedAt),
        ),
      )
      .returning({ vimeoId: directoryVideos.vimeoId, featured: directoryVideos.featured });
    const rows = await tx
      .update(directoryVideos)
      .set({
        // The video it replaces was the one at the top of the page: the new clip takes that place.
        featured: replaced.some((entry) => entry.featured),
        status: "approved",
        decidedAt: input.now,
        decidedByUserId: row.uploadedByUserId,
        vimeoHash: input.vimeoHash,
        posterUrl: input.posterUrl,
        width: input.width,
        height: input.height,
        durationMs: input.durationMs,
      })
      .where(eq(directoryVideos.id, input.videoId))
      .returning(VIDEO_COLUMNS);
    const video = rows[0];
    if (video === undefined) throw new Error("Directory video update returned no row");
    return { kind: "live", video, replacedVimeoIds: replaced.map((entry) => entry.vimeoId) };
  });
}

/**
 * Gives up an upload that cannot go live (too long, or Vimeo could not read it) and returns its Vimeo id; null when
 * there is no such upload waiting. A video that is live is never discarded here. Staff connection only.
 */
export async function discardDirectoryVideo(
  db: Database,
  input: { readonly videoId: string; readonly businessId: string; readonly now: Date },
): Promise<string | null> {
  if (!isUuid(input.videoId)) return null;
  return db.transaction(async (tx) => {
    await lockClaimForVideos(tx, input.businessId);
    const rows = await tx
      .update(directoryVideos)
      .set({ removedAt: input.now })
      .where(
        and(
          eq(directoryVideos.id, input.videoId),
          eq(directoryVideos.businessId, input.businessId),
          ne(directoryVideos.status, "approved"),
          isNull(directoryVideos.removedAt),
        ),
      )
      .returning({ vimeoId: directoryVideos.vimeoId });
    return rows[0]?.vimeoId ?? null;
  });
}

/** Removes the business's video in `slot`, live or still being prepared, and returns their Vimeo ids. Staff connection only, after the platform has checked the customer. */
export async function removeDirectoryVideo(
  db: Database,
  input: { readonly businessId: string; readonly slot: DirectoryVideoSlot; readonly now: Date },
): Promise<string[]> {
  return db.transaction(async (tx) => {
    await lockClaimForVideos(tx, input.businessId);
    const rows = await tx
      .update(directoryVideos)
      .set({ removedAt: input.now })
      .where(and(eq(directoryVideos.businessId, input.businessId), eq(directoryVideos.slot, input.slot), isNull(directoryVideos.removedAt)))
      .returning({ vimeoId: directoryVideos.vimeoId });
    return rows.map((row) => row.vimeoId);
  });
}

export type SetFeaturedDirectoryVideoOutcome =
  | { readonly kind: "set" }
  /** The video is not this business's live video (removed, still being prepared, or someone else's). */
  | { readonly kind: "not-found" }
  | { readonly kind: "not-member" };

/**
 * Chooses the one video shown in the mosaic at the top of the business's page, or none (`videoId` null). Any other
 * featured video of the business is unset in the same transaction, so there is never more than one. Staff connection
 * only, after the platform has checked the customer.
 */
export async function setFeaturedDirectoryVideo(
  db: Database,
  input: { readonly businessId: string; readonly videoId: string | null },
): Promise<SetFeaturedDirectoryVideoOutcome> {
  if (input.videoId !== null && !isUuid(input.videoId)) return { kind: "not-found" };
  return db.transaction(async (tx) => {
    await lockClaimForVideos(tx, input.businessId);
    if (!(await isMember(tx, input.businessId))) return { kind: "not-member" };
    if (input.videoId !== null) {
      const live = await tx
        .select({ id: directoryVideos.id })
        .from(directoryVideos)
        .where(
          and(
            eq(directoryVideos.id, input.videoId),
            eq(directoryVideos.businessId, input.businessId),
            eq(directoryVideos.status, "approved"),
            isNull(directoryVideos.removedAt),
          ),
        )
        .limit(1);
      if (live[0] === undefined) return { kind: "not-found" };
    }
    await tx
      .update(directoryVideos)
      .set({ featured: false })
      .where(and(eq(directoryVideos.businessId, input.businessId), eq(directoryVideos.featured, true), isNull(directoryVideos.removedAt)));
    if (input.videoId !== null) {
      await tx.update(directoryVideos).set({ featured: true }).where(eq(directoryVideos.id, input.videoId));
    }
    return { kind: "set" };
  });
}

/** Takes one video down (staff), whatever its state, and returns its Vimeo id; none when it is already gone. */
export async function takeDownDirectoryVideo(db: Database, videoId: string, now: Date): Promise<string[]> {
  if (!isUuid(videoId)) return [];
  const rows = await db
    .update(directoryVideos)
    .set({ removedAt: now })
    .where(and(eq(directoryVideos.id, videoId), isNull(directoryVideos.removedAt)))
    .returning({ vimeoId: directoryVideos.vimeoId });
  return rows.map((row) => row.vimeoId);
}

export interface StaffDirectoryVideo extends DirectoryVideo {
  readonly businessName: string;
  readonly listingKey: string;
  readonly claimStatus: DirectoryClaimStatus;
}

/** Videos for the staff console in one state, newest decision first. A business has exactly one claim, so the join never multiplies a video. */
export async function listDirectoryVideosForStaff(
  db: Database,
  input: { readonly status: DirectoryPictureStatus; readonly limit: number; readonly offset: number },
): Promise<{ readonly videos: StaffDirectoryVideo[]; readonly total: number }> {
  const where = and(eq(directoryVideos.status, input.status), isNull(directoryVideos.removedAt));
  const order = input.status === "pending" ? [asc(directoryVideos.createdAt), asc(directoryVideos.id)] : [desc(directoryVideos.decidedAt), desc(directoryVideos.id)];
  const [rows, totals] = await Promise.all([
    db
      .select({
        ...VIDEO_COLUMNS,
        businessName: directoryClaims.businessName,
        listingKey: directoryClaims.listingKey,
        claimStatus: directoryClaims.status,
      })
      .from(directoryVideos)
      .innerJoin(directoryClaims, eq(directoryClaims.businessId, directoryVideos.businessId))
      .where(where)
      .orderBy(...order)
      .limit(input.limit)
      .offset(input.offset),
    db.select({ value: count() }).from(directoryVideos).where(where),
  ]);
  return { videos: rows, total: totals[0]?.value ?? 0 };
}

/**
 * A video is on the website while it is live, not removed, its business's claim is approved, and the business is still
 * a Premium member: when the membership ends the videos stop showing and are not deleted.
 */
const IS_LIVE = and(
  eq(directoryVideos.status, "approved"),
  isNull(directoryVideos.removedAt),
  eq(directoryClaims.status, "approved"),
  eq(businesses.kind, "website"),
);

/** What the website needs to show one live video in Vimeo's player. */
export interface LiveDirectoryVideo {
  readonly id: string;
  readonly slot: DirectoryVideoSlot;
  readonly vimeoId: string;
  readonly vimeoHash: string;
  readonly posterUrl: string;
  readonly width: number;
  readonly height: number;
  readonly durationMs: number;
  /** The owner chose this one for the mosaic at the top of the page. */
  readonly featured: boolean;
}

/**
 * The live videos of each business in `lookup` that has any, in ONE statement, in slot order: those its claim's owner
 * uploaded, found through the claim's place (or its listing key, for a key no place has). Keyed the same way;
 * businesses with no live video are absent. Staff connection.
 */
export async function readLiveDirectoryVideos(db: Database, lookup: DirectoryLookup): Promise<ReadonlyMap<string, readonly LiveDirectoryVideo[]>> {
  if (isEmptyDirectoryLookup(lookup)) return new Map();
  const rows = await db
    .select({
      business: directoryBusinessOf(CLAIM_BUSINESS),
      id: directoryVideos.id,
      slot: directoryVideos.slot,
      vimeoId: directoryVideos.vimeoId,
      vimeoHash: directoryVideos.vimeoHash,
      posterUrl: directoryVideos.posterUrl,
      width: directoryVideos.width,
      height: directoryVideos.height,
      durationMs: directoryVideos.durationMs,
      featured: directoryVideos.featured,
    })
    .from(directoryVideos)
    .innerJoin(directoryClaims, eq(directoryClaims.businessId, directoryVideos.businessId))
    .innerJoin(businesses, eq(businesses.id, directoryVideos.businessId))
    .where(and(matchesDirectoryLookup(CLAIM_BUSINESS, lookup), IS_LIVE))
    .orderBy(asc(directoryVideos.slot));
  const out = new Map<string, LiveDirectoryVideo[]>();
  for (const { business, vimeoHash, posterUrl, width, height, durationMs, ...rest } of rows) {
    // A live video is always complete (directory_videos_live_check), so these are never null here.
    if (vimeoHash === null || posterUrl === null || width === null || height === null || durationMs === null) continue;
    const list = out.get(business) ?? [];
    list.push({ ...rest, vimeoHash, posterUrl, width, height, durationMs });
    out.set(business, list);
  }
  return out;
}
