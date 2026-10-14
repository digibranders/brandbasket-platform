import { sql } from "drizzle-orm";
import { check, index, pgEnum, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { uuidv7 } from "uuidv7";
import {
  PLACE_ID_ALPHABET,
  PLACE_ID_LENGTH,
  PLACE_URL_CHANGE_REASON_MAX,
  PLACE_URL_CHANGE_REASON_MIN,
  PLACE_URL_SLUG_MAX,
} from "../place-id";
import { users } from "./auth";
import { createdAt, updatedAt } from "./columns";

/** The same rule as isPlaceId in ../place-id, as Postgres regular expressions: the alphabet, and at least one digit. */
const PLACE_ID_REGEX = `^[${PLACE_ID_ALPHABET}]{${PLACE_ID_LENGTH}}$`;
const SLUG_REGEX = "^[a-z0-9]+(-[a-z0-9]+)*$";
/** Same four kebab segments as LISTING_KEY_REGEX in ./directory-reviews. */
const LISTING_KEY_REGEX = "^[a-z0-9]+(-[a-z0-9]+)*(/[a-z0-9]+(-[a-z0-9]+)*){3}$";

/** Where a directory business came from. A client that takes over an open-data business keeps that row and its id. */
export const directoryPlaceOrigin = pgEnum("directory_place_origin", ["open_data", "client", "added"]);
export type DirectoryPlaceOrigin = (typeof directoryPlaceOrigin.enumValues)[number];

/**
 * One business in the /in directory, for good. Its id is the last part of its URL, /in/mh/<city>/business/<slug>/<id>,
 * and never changes. city_slug and url_slug are the URL's label: free while an owner-added business awaits approval
 * (url_locked_at null), frozen once its page is live, and then changed only by changePlaceUrl (staff, audited in
 * directory_place_url_changes). The page is found by id; a stale label 301s to this one. Staff-only (see 0076).
 */
export const directoryPlaces = pgTable(
  "directory_places",
  {
    id: text("id").primaryKey(),
    origin: directoryPlaceOrigin("origin").notNull(),
    /**
     * "overture:<id>" / "osm:<type>/<id>" for an open-data business, "survey:0x…:0x…" for one the Fynix team
     * surveyed, from the dataset ledger (directory-place-ledger.ts); null otherwise.
     */
    sourceRef: text("source_ref").unique("directory_places_source_ref_key"),
    stateCode: text("state_code").notNull(),
    citySlug: text("city_slug").notNull(),
    urlSlug: text("url_slug").notNull(),
    urlLockedAt: timestamp("url_locked_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (table) => [
    check("directory_places_id_check", sql`${table.id} ~ ${sql.raw(`'${PLACE_ID_REGEX}'`)} and ${table.id} ~ '[2-9]'`),
    // Open-data ids start with a letter and platform ids with a digit, so the two can never collide. A client may
    // have either: it gets a fresh digit-first id, or takes over an open-data business and keeps its letter-first id.
    check(
      "directory_places_origin_id_check",
      sql`(${table.origin} = 'open_data') = (${table.id} ~ '^[a-z]') or ${table.origin} = 'client'`,
    ),
    check("directory_places_state_code_check", sql`${table.stateCode} ~ '^[a-z]{2}$'`),
    check("directory_places_city_slug_check", sql`${table.citySlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)}`),
    check(
      "directory_places_url_slug_check",
      sql`${table.urlSlug} ~ ${sql.raw(`'${SLUG_REGEX}'`)} and char_length(${table.urlSlug}) <= ${sql.raw(String(PLACE_URL_SLUG_MAX))}`,
    ),
  ],
);

/**
 * The /in/<service>/mh/<city>/<area>/<slug> addresses businesses had before ids, as <service>/<city>/<area>/<slug>.
 * Used to backfill place_id, to read and write by address while the website still sends addresses, and to 301 old
 * links forever. Written at cutover (the import and the backfill) and, until the website sends ids (Task 12 of the
 * plan), for the addresses new platform businesses go live at (registerLegacyKeys). Never changed or removed.
 */
export const directoryPlaceLegacyKeys = pgTable(
  "directory_place_legacy_keys",
  {
    listingKey: text("listing_key").primaryKey(),
    placeId: text("place_id")
      .notNull()
      .references(() => directoryPlaces.id),
  },
  (table) => [
    // A place's old addresses, for the feed.
    index("directory_place_legacy_keys_place_id_idx").on(table.placeId),
    check(
      "directory_place_legacy_keys_listing_key_check",
      sql`char_length(${table.listingKey}) <= 200 and ${table.listingKey} ~ ${sql.raw(`'${LISTING_KEY_REGEX}'`)}`,
    ),
  ],
);

/** Every staff change to a live business's URL: who, when, from what, to what, and why. Never updated or deleted. */
export const directoryPlaceUrlChanges = pgTable(
  "directory_place_url_changes",
  {
    id: uuid("id")
      .primaryKey()
      .$defaultFn(() => uuidv7()),
    placeId: text("place_id")
      .notNull()
      .references(() => directoryPlaces.id),
    fromCitySlug: text("from_city_slug").notNull(),
    fromUrlSlug: text("from_url_slug").notNull(),
    toCitySlug: text("to_city_slug").notNull(),
    toUrlSlug: text("to_url_slug").notNull(),
    reason: text("reason").notNull(),
    changedByUserId: text("changed_by_user_id")
      .notNull()
      .references(() => users.id),
    changedAt: timestamp("changed_at", { withTimezone: true }).notNull(),
  },
  (table) => [
    // A place's history, oldest first: the first row's from_* is the URL the place went live with.
    index("directory_place_url_changes_place_id_idx").on(table.placeId, table.changedAt),
    check(
      "directory_place_url_changes_reason_check",
      sql`char_length(${table.reason}) between ${sql.raw(String(PLACE_URL_CHANGE_REASON_MIN))} and ${sql.raw(String(PLACE_URL_CHANGE_REASON_MAX))}`,
    ),
  ],
);
