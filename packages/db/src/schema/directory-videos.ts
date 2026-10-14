import { sql } from "drizzle-orm";
import { boolean, check, index, integer, pgTable, smallint, text, timestamp, uniqueIndex, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt } from "./columns";
import { directoryPictureStatus } from "./directory-pictures";

/*
 * A Premium member's short videos on its business page (docs/superpowers/specs/2026-10-07-business-videos-design.md):
 * up to three clips of at most 16 seconds, hosted on Vimeo (unlisted) and shown in Vimeo's player. A row is `pending`
 * from the moment the owner asks to upload until Vimeo has prepared the file and it is checked, then `approved`, which
 * here means live: a video needs no approval from us, and staff can only take one down. The status type is the
 * pictures' own (docs/superpowers/specs/2026-09-30-listing-pictures-crop-design.md).
 *
 * The customer reads its own rows through row-level security and writes nothing directly: starting, completing and
 * removing run on the staff connection after the platform has checked who is asking (see 0093).
 */

/** The places a business has for a video. */
export const DIRECTORY_VIDEO_SLOTS = [1, 2, 3] as const;
export type DirectoryVideoSlot = (typeof DIRECTORY_VIDEO_SLOTS)[number];

/**
 * One video. A slot holds at most one live video, which is what the page shows, and at most one that is still being
 * prepared, so a live video stays up while its replacement uploads. A removed video keeps its row; the video itself is
 * deleted from Vimeo.
 */
export const directoryVideos = pgTable(
  "directory_videos",
  {
    /** Generated before the upload starts, so the dashboard can name the row while the file is on its way. */
    id: uuid("id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    slot: smallint("slot").$type<DirectoryVideoSlot>().notNull(),
    /** Vimeo's own id for the video: digits. */
    vimeoId: text("vimeo_id").notNull(),
    /** The privacy hash an unlisted video's embed address carries; set once the video is ready. */
    vimeoHash: text("vimeo_hash"),
    /** A still from the video, on Vimeo's image host; set once the video is ready. */
    posterUrl: text("poster_url"),
    /** The size the owner said the file would be, in bytes. */
    bytes: integer("bytes").notNull(),
    /** What Vimeo reported once it had prepared the video. All three are set together, with the hash and poster. */
    width: integer("width"),
    height: integer("height"),
    durationMs: integer("duration_ms"),
    status: directoryPictureStatus("status").notNull().default("pending"),
    /**
     * The owner's pick of the one video shown in the mosaic at the top of the business page. At most one per business,
     * and only a live video; a new video uploaded into the same slot inherits it, so replacing a clip keeps its place.
     */
    featured: boolean("featured").notNull().default(false),
    decidedAt: timestamp("decided_at", { withTimezone: true }),
    decidedByUserId: text("decided_by_user_id").references(() => users.id),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    /** Set when the owner or staff remove it, a newer video takes its place, or its upload is given up; it is deleted from Vimeo then. */
    removedAt: timestamp("removed_at", { withTimezone: true }),
  },
  (table) => [
    uniqueIndex("directory_videos_one_live_per_slot_idx")
      .on(table.businessId, table.slot)
      .where(sql`${table.status} = 'approved' and ${table.removedAt} is null`),
    uniqueIndex("directory_videos_one_waiting_per_slot_idx")
      .on(table.businessId, table.slot)
      .where(sql`${table.status} <> 'approved' and ${table.removedAt} is null`),
    uniqueIndex("directory_videos_one_featured_idx")
      .on(table.businessId)
      .where(sql`${table.featured} and ${table.removedAt} is null`),
    uniqueIndex("directory_videos_vimeo_id_idx").on(table.vimeoId).where(sql`${table.removedAt} is null`),
    index("directory_videos_status_created_at_idx")
      .on(table.status, table.createdAt)
      .where(sql`${table.removedAt} is null`),
    check("directory_videos_slot_check", sql`${table.slot} between 1 and 3`),
    check("directory_videos_vimeo_id_check", sql`${table.vimeoId} ~ '^[0-9]{1,20}$'`),
    check("directory_videos_hash_check", sql`${table.vimeoHash} is null or ${table.vimeoHash} ~ '^[0-9a-f]{6,32}$'`),
    check("directory_videos_poster_check", sql`${table.posterUrl} is null or ${table.posterUrl} like 'https://i.vimeocdn.com/%'`),
    check("directory_videos_size_check", sql`${table.bytes} > 0`),
    check(
      "directory_videos_ready_check",
      sql`(${table.width} is null) = (${table.height} is null) and (${table.width} is null) = (${table.durationMs} is null) and (${table.width} is null or (${table.width} > 0 and ${table.height} > 0 and ${table.durationMs} > 0))`,
    ),
    // A live video is complete: it can be shown without asking Vimeo anything.
    check(
      "directory_videos_live_check",
      sql`${table.status} <> 'approved' or (${table.vimeoHash} is not null and ${table.posterUrl} is not null and ${table.width} is not null)`,
    ),
    // Only a live video can be the featured one.
    check("directory_videos_featured_check", sql`not ${table.featured} or ${table.status} = 'approved'`),
    check(
      "directory_videos_decided_check",
      sql`(${table.status} = 'pending') = (${table.decidedAt} is null) and (${table.decidedAt} is null) = (${table.decidedByUserId} is null)`,
    ),
  ],
);
