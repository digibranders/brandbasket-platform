import { sql } from "drizzle-orm";
import { check, index, integer, pgEnum, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { users } from "./auth";
import { businesses } from "./businesses";
import { createdAt } from "./columns";

/**
 * `uploading` and `processing` (spec §6) belong to the background worker, which does not exist yet: uploads are
 * processed in the request, so a row is only ever written once the file is ready or refused.
 */
export const mediaAssetStatus = pgEnum("media_asset_status", ["ready", "rejected"]);
export type MediaAssetStatus = (typeof mediaAssetStatus.enumValues)[number];

export const mediaAssetPurpose = pgEnum("media_asset_purpose", ["logo", "photo"]);
export type MediaAssetPurpose = (typeof mediaAssetPurpose.enumValues)[number];

export const mediaAssets = pgTable(
  "media_assets",
  {
    /** Generated before the file is stored, because the storage key is built from it. */
    id: uuid("id").primaryKey(),
    businessId: uuid("business_id")
      .notNull()
      .references(() => businesses.id),
    purpose: mediaAssetPurpose("purpose").notNull(),
    /**
     * Built only from ids: `t/{businessId}/{id}/display`. A check constraint holds every row to exactly that, so a
     * row can never point at another business's file. Never contains anything the customer typed or named.
     */
    storageKey: text("storage_key").notNull(),
    /** For the customer's own reference. Must never appear in a storage key or a URL. */
    originalFilename: text("original_filename").notNull(),
    /** The type of the stored, re-encoded file, not what the browser claimed. */
    mimeType: text("mime_type").notNull(),
    bytes: integer("bytes").notNull(),
    width: integer("width").notNull(),
    height: integer("height").notNull(),
    sha256: text("sha256").notNull(),
    altText: text("alt_text"),
    status: mediaAssetStatus("status").notNull(),
    uploadedByUserId: text("uploaded_by_user_id")
      .notNull()
      .references(() => users.id),
    createdAt: createdAt(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
  },
  (table) => [
    index("media_assets_business_purpose_created_idx").on(table.businessId, table.purpose, table.createdAt),
    check(
      "media_assets_storage_key_check",
      sql`${table.storageKey} = 't/' || ${table.businessId} || '/' || ${table.id} || '/display'`,
    ),
    // Target of tenant-scoped (media_id, business_id) foreign keys, same reasoning as projects_id_business_id_unique
    // in packages/db/src/schema/projects.ts: FK checks bypass row-level security, so a plain id reference would let
    // one business's row point at another business's media file.
    unique("media_assets_id_business_id_unique").on(table.id, table.businessId),
  ],
);
