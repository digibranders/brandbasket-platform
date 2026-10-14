import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt } from "./columns";

/*
 * A listing owner's own pictures on the local directory (docs/superpowers/specs/2026-09-30-listing-pictures-crop-
 * design.md): the square photo beside its name, and its ad picture in the side column's two shapes. Each is cropped
 * in the owner's browser to its slot's shape and stored at exactly that slot's size.
 *
 * The customer reads its own rows through row-level security and writes nothing directly: uploading, removing and
 * deciding run on the staff connection after the platform has checked who is asking (see 0070).
 */

/**
 * `listing` is the square photo (the sheet's feature image); `ad_tall` and `ad_wide` are the ad picture for side spots 1
 * and 2; `banner` is the wide image across the top of the business's page; `gallery_1` to `gallery_20` are its gallery (six until migration 0134).
 */
export const DIRECTORY_PICTURE_SLOTS = [
  "listing",
  "ad_tall",
  "ad_wide",
  "banner",
  "gallery_1",
  "gallery_2",
  "gallery_3",
  "gallery_4",
  "gallery_5",
  "gallery_6",
  "gallery_7",
  "gallery_8",
  "gallery_9",
  "gallery_10",
  "gallery_11",
  "gallery_12",
  "gallery_13",
  "gallery_14",
  "gallery_15",
  "gallery_16",
  "gallery_17",
  "gallery_18",
  "gallery_19",
  "gallery_20",
] as const;
export const directoryPictureSlot = pgEnum("directory_picture_slot", DIRECTORY_PICTURE_SLOTS);
export type DirectoryPictureSlot = (typeof DIRECTORY_PICTURE_SLOTS)[number];

export const directoryPictureStatus = pgEnum("directory_picture_status", ["pending", "approved", "rejected"]);
export type DirectoryPictureStatus = (typeof directoryPictureStatus.enumValues)[number];

/**
 * One uploaded picture. A slot holds at most one approved picture, which is what the website shows, and at most one
 * that is waiting for staff or was refused; both are kept until replaced or removed, so a picture that is live stays
 * up while its replacement is checked.
 */
export const directoryPictures = pgTable(
  "directory_pictures",
  {
    /** Generated before the file is stored, because the storage key is built from it. */
    id: uuid("id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    slot: directoryPictureSlot("slot").notNull(),
    /** Built only from ids, like media_assets: `t/{businessId}/{id}/display`. */
    storageKey: text("storage_key").notNull(),
    /** The type of the stored, re-encoded file. */
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sha256: text("sha256").notNull(),
    status: directoryPictureStatus("status").notNull().default("pending"),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: text("decided_by_user_id").references(() => users.id),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    /** Set when the owner removes it or a newer picture takes its place; its file is deleted then. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("directory_pictures_one_live_per_slot_idx")
      .on(table.businessId, table.slot)
      .where(sql`${table.status} = 'approved' and ${table.removedAt} is null`),
    uniqueIndex("directory_pictures_one_waiting_per_slot_idx")
      .on(table.businessId, table.slot)
      .where(sql`${table.status} <> 'approved' and ${table.removedAt} is null`),
    // The staff console's queue, oldest first.
    index("directory_pictures_status_created_at_idx")
      .on(table.status, table.createdAt)
      .where(sql`${table.removedAt} is null`),
    check(
      "directory_pictures_storage_key_check",
      sql`${table.storageKey} = 't/' || ${table.businessId} || '/' || ${table.id} || '/display'`,
    ),
    check("directory_pictures_size_check", sql`${table.bytes} > 0 and ${table.width} > 0 and ${table.height} > 0`),
    check(
      "directory_pictures_decided_check",
      sql`(${table.status} = 'pending') = (${table.decidedAt} is null) and (${table.decidedAt} is null) = (${table.decidedByUserId} is null)`,
    ),
  ],
);
