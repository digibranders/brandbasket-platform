import { and, asc, count, desc, eq, inArray, isNull, ne } from "drizzle-orm";
import { uuidv7 } from "uuidv7";
import type { Database } from "../client";
import {
  businesses,
  directoryClaims,
  directoryPictures,
  DIRECTORY_PICTURE_SLOTS,
  type DirectoryClaimStatus,
  type DirectoryPictureSlot,
  type DirectoryPictureStatus,
} from "../schema";
import type { ScopedTransaction } from "../scope";
import { directoryBusinessOf, isEmptyDirectoryLookup, matchesDirectoryLookup, type DirectoryLookup } from "./directory-refs";

/** The columns a picture's business is found by: its owner's claim. */
const CLAIM_BUSINESS = { placeId: directoryClaims.placeId, listingKey: directoryClaims.listingKey } as const;
import { businessUrlCode } from "../place-id";
import { isUuid } from "./tenant";

type Runner = Database | ScopedTransaction;

/*
 * A listing owner's pictures (docs/superpowers/specs/2026-09-30-listing-pictures-crop-design.md). The customer reads
 * its own rows through row-level security; everything that writes runs on the staff connection after the platform
 * has checked the customer or the staff member. Every write that drops a picture returns its storage key, for the
 * caller to delete the file once the transaction has committed.
 */

/** The storage key is built from the id, so the id exists before the row does. */
export function newDirectoryPictureId(): string {
  return uuidv7();
}

export interface DirectoryPicture {
  readonly id: string;
  readonly businessId: string;
  readonly slot: DirectoryPictureSlot;
  readonly status: DirectoryPictureStatus;
  readonly width: number;
  readonly height: number;
  readonly createdAt: Date;
  readonly decidedAt: Date | null;
}

const PICTURE_COLUMNS = {
  id: directoryPictures.id,
  businessId: directoryPictures.businessId,
  slot: directoryPictures.slot,
  status: directoryPictures.status,
  width: directoryPictures.width,
  height: directoryPictures.height,
  createdAt: directoryPictures.createdAt,
  decidedAt: directoryPictures.decidedAt,
} as const;

/** What serving a picture needs from its row. */
export interface DirectoryPictureFile {
  readonly storageKey: string;
  readonly mimeType: string;
  /** Hex SHA-256 of the stored file. */
  readonly sha256: string;
}

const FILE_COLUMNS = {
  storageKey: directoryPictures.storageKey,
  mimeType: directoryPictures.mimeType,
  sha256: directoryPictures.sha256,
} as const;

/**
 * The business's pictures that have not been removed, oldest first: per slot, the live one and the one waiting or
 * refused. Works through row-level security (the Photos page) and on staff.
 */
export async function listDirectoryPictures(db: Runner, businessId: string): Promise<DirectoryPicture[]> {
  return db
    .select(PICTURE_COLUMNS)
    .from(directoryPictures)
    .where(and(eq(directoryPictures.businessId, businessId), isNull(directoryPictures.removedAt)))
    .orderBy(asc(directoryPictures.createdAt), asc(directoryPictures.id));
}

/**
 * One of the business's own pictures, whatever its status, for the owner to see what they uploaded. Another
 * business's id, a removed picture and anything that is not a UUID are all simply not found.
 */
export async function findOwnDirectoryPictureFile(db: Runner, businessId: string, pictureId: string): Promise<DirectoryPictureFile | null> {
  if (!isUuid(pictureId)) return null;
  const rows = await db
    .select(FILE_COLUMNS)
    .from(directoryPictures)
    .where(and(eq(directoryPictures.id, pictureId), eq(directoryPictures.businessId, businessId), isNull(directoryPictures.removedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * Locks the business's claim row for the rest of the transaction and returns its status, or null when it has no
 * claim. Every write to a business's pictures takes this first, so an upload, a removal and a staff decision for one
 * business run one after the other and never wait on each other's picture rows in opposite orders.
 */
async function lockClaimForPictures(tx: ScopedTransaction, businessId: string): Promise<DirectoryClaimStatus | null> {
  const claims = await tx
    .select({ status: directoryClaims.status })
    .from(directoryClaims)
    .where(eq(directoryClaims.businessId, businessId))
    .limit(1)
    .for("update");
  return claims[0]?.status ?? null;
}

export interface NewDirectoryPicture {
  /** From newDirectoryPictureId(); the same id the storage key was built from. */
  readonly id: string;
  readonly businessId: string;
  readonly slot: DirectoryPictureSlot;
  readonly storageKey: string;
  readonly mimeType: string;
  readonly bytes: number;
  readonly width: number;
  readonly height: number;
  readonly sha256: string;
  readonly uploadedByUserId: string;
  readonly now: Date;
  /**
   * True records the picture as approved by its uploader and takes down the slot's live picture at once: the Business
   * profile's featured photo goes up with no check from us (docs/superpowers/specs/2026-10-01-business-profile-
   * design.md). Left out, it waits for staff, and the live picture stays up until it is approved.
   */
  readonly goesLive?: boolean;
}

export type RecordDirectoryPictureOutcome =
  | { readonly kind: "recorded"; readonly picture: DirectoryPicture; readonly replacedStorageKeys: readonly string[] }
  /**
   * Nothing for a picture to show on: the business is not a free listing account with no claim yet, and has no claim
   * either, or its claim was rejected.
   */
  | { readonly kind: "no-claim" };

/**
 * Whether the business may have pictures, taking the lock lockClaimForPictures takes. A business with a claim may
 * unless the claim was rejected. A free listing account with no claim yet may too: its owner fills in the Business
 * profile's Photos tab before choosing where it is listed, and its row is locked instead, so two uploads still run one
 * after the other.
 */
async function lockPicturesOwner(tx: ScopedTransaction, businessId: string): Promise<boolean> {
  const claimStatus = await lockClaimForPictures(tx, businessId);
  if (claimStatus !== null) return claimStatus !== "rejected";
  const owner = await tx.select({ kind: businesses.kind }).from(businesses).where(eq(businesses.id, businessId)).limit(1).for("update");
  return owner[0]?.kind === "listing";
}

/**
 * Records a stored upload. Waiting for staff, it takes the place of the slot's picture that was waiting or refused,
 * and the slot's live picture stays up until this one is approved. Going live (`goesLive`), it takes the place of every
 * picture in the slot. Staff connection only, after the platform has checked the customer.
 */
export async function recordDirectoryPicture(db: Database, input: NewDirectoryPicture): Promise<RecordDirectoryPictureOutcome> {
  if (!isUuid(input.id)) throw new Error(`Directory picture id must be a UUID, received "${input.id}"`);
  const goesLive = input.goesLive === true;
  return db.transaction(async (tx) => {
    if (!(await lockPicturesOwner(tx, input.businessId))) return { kind: "no-claim" };

    const replaced = await tx
      .update(directoryPictures)
      .set({ removedAt: input.now })
      .where(
        and(
          eq(directoryPictures.businessId, input.businessId),
          eq(directoryPictures.slot, input.slot),
          goesLive ? undefined : ne(directoryPictures.status, "approved"),
          isNull(directoryPictures.removedAt),
        ),
      )
      .returning({ storageKey: directoryPictures.storageKey });

    const rows = await tx
      .insert(directoryPictures)
      .values({
        id: input.id,
        businessId: input.businessId,
        slot: input.slot,
        storageKey: input.storageKey,
        mimeType: input.mimeType,
        bytes: input.bytes,
        width: input.width,
        height: input.height,
        sha256: input.sha256,
        uploadedByUserId: input.uploadedByUserId,
        createdAt: input.now,
        ...(goesLive ? { status: "approved" as const, decidedAt: input.now, decidedByUserId: input.uploadedByUserId } : {}),
      })
      .returning(PICTURE_COLUMNS);
    const picture = rows[0];
    if (picture === undefined) throw new Error("Directory picture insert returned no row");
    return { kind: "recorded", picture, replacedStorageKeys: replaced.map((row) => row.storageKey) };
  });
}

/**
 * Removes every picture the business has in `slots`, live or waiting, and returns their storage keys. Staff
 * connection only, after the platform has checked the customer.
 */
export async function removeDirectoryPictures(
  db: Database,
  input: { readonly businessId: string; readonly slots: readonly DirectoryPictureSlot[]; readonly now: Date },
): Promise<string[]> {
  if (input.slots.length === 0) return [];
  return db.transaction(async (tx) => {
    await lockClaimForPictures(tx, input.businessId);
    const rows = await tx
      .update(directoryPictures)
      .set({ removedAt: input.now })
      .where(
        and(
          eq(directoryPictures.businessId, input.businessId),
          inArray(directoryPictures.slot, [...input.slots]),
          isNull(directoryPictures.removedAt),
        ),
      )
      .returning({ storageKey: directoryPictures.storageKey });
    return rows.map((row) => row.storageKey);
  });
}

export type DirectoryPictureDecision =
  | { readonly kind: "decided"; readonly replacedStorageKeys: readonly string[] }
  /** No such picture is waiting: it was removed, replaced, or another staff member decided it first. */
  | { readonly kind: "not-found" };

/**
 * Approves or refuses a waiting picture (staff). Approving puts it on the website in place of the slot's live
 * picture, whose storage key is returned for its file to be deleted. A refused picture stays for its owner to see.
 */
export async function decideDirectoryPicture(
  db: Database,
  input: { readonly pictureId: string; readonly approve: boolean; readonly staffId: string; readonly now: Date },
): Promise<DirectoryPictureDecision> {
  if (!isUuid(input.pictureId)) return { kind: "not-found" };
  const isWaiting = and(eq(directoryPictures.id, input.pictureId), eq(directoryPictures.status, "pending"), isNull(directoryPictures.removedAt));
  return db.transaction(async (tx) => {
    // Whose picture it is, read without a lock, so the business's claim can be locked before any picture row is.
    const owners = await tx.select({ businessId: directoryPictures.businessId }).from(directoryPictures).where(isWaiting).limit(1);
    const owner = owners[0];
    if (owner === undefined) return { kind: "not-found" };
    await lockClaimForPictures(tx, owner.businessId);

    // Read again under the lock: the owner may have replaced or removed it in the meantime.
    const waiting = await tx
      .select({ businessId: directoryPictures.businessId, slot: directoryPictures.slot })
      .from(directoryPictures)
      .where(isWaiting)
      .limit(1)
      .for("update");
    const picture = waiting[0];
    if (picture === undefined) return { kind: "not-found" };

    const replaced = input.approve
      ? await tx
          .update(directoryPictures)
          .set({ removedAt: input.now })
          .where(
            and(
              eq(directoryPictures.businessId, picture.businessId),
              eq(directoryPictures.slot, picture.slot),
              eq(directoryPictures.status, "approved"),
              isNull(directoryPictures.removedAt),
            ),
          )
          .returning({ storageKey: directoryPictures.storageKey })
      : [];
    await tx
      .update(directoryPictures)
      .set({ status: input.approve ? "approved" : "rejected", decidedAt: input.now, decidedByUserId: input.staffId })
      .where(eq(directoryPictures.id, input.pictureId));
    return { kind: "decided", replacedStorageKeys: replaced.map((row) => row.storageKey) };
  });
}

/**
 * Takes one picture down (staff), whatever its status, and returns its storage key; null when it is already gone.
 * For a live picture that should not have been approved.
 */
export async function takeDownDirectoryPicture(db: Database, pictureId: string, now: Date): Promise<string | null> {
  if (!isUuid(pictureId)) return null;
  const rows = await db
    .update(directoryPictures)
    .set({ removedAt: now })
    .where(and(eq(directoryPictures.id, pictureId), isNull(directoryPictures.removedAt)))
    .returning({ storageKey: directoryPictures.storageKey });
  return rows[0]?.storageKey ?? null;
}

export interface StaffDirectoryPicture extends DirectoryPicture {
  readonly businessName: string;
  readonly listingKey: string;
  readonly claimStatus: DirectoryClaimStatus;
}

/**
 * Pictures for the staff console in one status: waiting ones oldest first, the rest newest decision first. A
 * business has exactly one claim, so the join never multiplies a picture.
 */
export async function listDirectoryPicturesForStaff(
  db: Database,
  input: { readonly status: DirectoryPictureStatus; readonly limit: number; readonly offset: number },
): Promise<{ readonly pictures: StaffDirectoryPicture[]; readonly total: number }> {
  const where = and(eq(directoryPictures.status, input.status), isNull(directoryPictures.removedAt));
  const order =
    input.status === "pending"
      ? [asc(directoryPictures.createdAt), asc(directoryPictures.id)]
      : [desc(directoryPictures.decidedAt), desc(directoryPictures.id)];
  const [rows, totals] = await Promise.all([
    db
      .select({
        ...PICTURE_COLUMNS,
        businessName: directoryClaims.businessName,
        listingKey: directoryClaims.listingKey,
        claimStatus: directoryClaims.status,
      })
      .from(directoryPictures)
      .innerJoin(directoryClaims, eq(directoryClaims.businessId, directoryPictures.businessId))
      .where(where)
      .orderBy(...order)
      .limit(input.limit)
      .offset(input.offset),
    db.select({ value: count() }).from(directoryPictures).where(where),
  ]);
  return { pictures: rows, total: totals[0]?.value ?? 0 };
}

/** How many pictures are waiting for a staff check. */
export async function countWaitingDirectoryPictures(db: Database): Promise<number> {
  const rows = await db
    .select({ value: count() })
    .from(directoryPictures)
    .where(and(eq(directoryPictures.status, "pending"), isNull(directoryPictures.removedAt)));
  return rows[0]?.value ?? 0;
}

/** Any picture that has not been removed, for staff to look at before deciding. Only call after checking staff access. */
export async function findDirectoryPictureFileForStaff(db: Database, pictureId: string): Promise<DirectoryPictureFile | null> {
  if (!isUuid(pictureId)) return null;
  const rows = await db
    .select(FILE_COLUMNS)
    .from(directoryPictures)
    .where(and(eq(directoryPictures.id, pictureId), isNull(directoryPictures.removedAt)))
    .limit(1);
  return rows[0] ?? null;
}

/** A picture is on the website while it is approved, not removed, and its business's claim is still approved. */
const IS_LIVE = and(
  eq(directoryPictures.status, "approved"),
  isNull(directoryPictures.removedAt),
  eq(directoryClaims.status, "approved"),
);

/** A picture the website may show, or null. Staff connection: the website's shared secret has already been checked. */
export async function findLiveDirectoryPictureFile(db: Database, pictureId: string): Promise<DirectoryPictureFile | null> {
  if (!isUuid(pictureId)) return null;
  const rows = await db
    .select(FILE_COLUMNS)
    .from(directoryPictures)
    .innerJoin(directoryClaims, eq(directoryClaims.businessId, directoryPictures.businessId))
    .where(and(eq(directoryPictures.id, pictureId), IS_LIVE))
    .limit(1);
  return rows[0] ?? null;
}

/**
 * A picture the owner's live preview may show for a business that is not live yet: approved and not removed, on a claim
 * that was not refused, and its business's page address (`code`, from its place id) is the one the preview was opened for.
 * The preview draws pages for businesses the website does not hold yet, so their pictures are not "live" and the
 * website's ordinary route is refused them. Staff connection: the website's shared secret has already been checked.
 */
export async function findPreviewDirectoryPictureFile(db: Database, pictureId: string, code: string): Promise<DirectoryPictureFile | null> {
  if (!isUuid(pictureId)) return null;
  const rows = await db
    .select({ ...FILE_COLUMNS, placeId: directoryClaims.placeId })
    .from(directoryPictures)
    .innerJoin(directoryClaims, eq(directoryClaims.businessId, directoryPictures.businessId))
    .where(
      and(
        eq(directoryPictures.id, pictureId),
        eq(directoryPictures.status, "approved"),
        isNull(directoryPictures.removedAt),
        ne(directoryClaims.status, "rejected"),
      ),
    )
    .limit(1);
  const row = rows[0];
  if (row === undefined || row.placeId === null || businessUrlCode(row.placeId) !== code) return null;
  return { storageKey: row.storageKey, mimeType: row.mimeType, sha256: row.sha256 };
}

/**
 * A business's own pictures that are approved and not removed, by slot, whether or not its page is live: what its page
 * will show once it is. For the owner's preview of a page that is not live yet. Staff connection.
 */
export async function readOwnApprovedDirectoryPictures(db: Database, businessId: string): Promise<LiveDirectoryPictures> {
  const rows = await db
    .select({ slot: directoryPictures.slot, id: directoryPictures.id })
    .from(directoryPictures)
    .where(and(eq(directoryPictures.businessId, businessId), eq(directoryPictures.status, "approved"), isNull(directoryPictures.removedAt)));
  const out = noLivePictures();
  for (const row of rows) out[row.slot] = row.id;
  return out;
}

/** A picture's id and the key of its file. */
export interface DirectoryPictureKey {
  readonly id: string;
  readonly storageKey: string;
}

/**
 * Every picture that still has a file: the ones on show and the ones waiting for or refused by staff, but not the ones
 * removed. For the job that makes the smaller copies of pictures uploaded before copies existed (staff connection).
 */
export async function listDirectoryPictureKeys(db: Database): Promise<readonly DirectoryPictureKey[]> {
  return db
    .select({ id: directoryPictures.id, storageKey: directoryPictures.storageKey })
    .from(directoryPictures)
    .where(isNull(directoryPictures.removedAt))
    .orderBy(directoryPictures.createdAt);
}

/** The ids of a listing's live pictures, by slot; a slot with none is null or left out. */
export type LiveDirectoryPictures = Readonly<Partial<Record<DirectoryPictureSlot, string | null>>>;

/** A business's live pictures with every slot empty, for the ones it has to be filled into. */
function noLivePictures(): Record<DirectoryPictureSlot, string | null> {
  return Object.fromEntries(DIRECTORY_PICTURE_SLOTS.map((slot) => [slot, null])) as Record<DirectoryPictureSlot, string | null>;
}

/**
 * The live pictures of each business in `lookup` that has any, in ONE statement: those its claim's owner uploaded,
 * found through the claim's place (or its listing key, for a key no place has). Keyed the same way; businesses with
 * no live picture are absent. Staff connection.
 */
export async function readLiveDirectoryPictures(db: Database, lookup: DirectoryLookup): Promise<ReadonlyMap<string, LiveDirectoryPictures>> {
  if (isEmptyDirectoryLookup(lookup)) return new Map();
  const rows = await db
    .select({ business: directoryBusinessOf(CLAIM_BUSINESS), slot: directoryPictures.slot, id: directoryPictures.id })
    .from(directoryPictures)
    .innerJoin(directoryClaims, eq(directoryClaims.businessId, directoryPictures.businessId))
    .where(and(matchesDirectoryLookup(CLAIM_BUSINESS, lookup), IS_LIVE));
  const out = new Map<string, Partial<Record<DirectoryPictureSlot, string | null>>>();
  for (const row of rows) {
    const pictures = out.get(row.business) ?? noLivePictures();
    pictures[row.slot] = row.id;
    out.set(row.business, pictures);
  }
  return out;
}
