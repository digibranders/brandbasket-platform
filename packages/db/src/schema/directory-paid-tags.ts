import { pgEnum } from "drizzle-orm/pg-core";

/**
 * The paid tags a client can put on their the local directory listing for a week at a time, in the order the Listing page
 * offers them. The contract's PAID_TAGS (apps/platform/lib/directory-api.ts) lists the same ids; a parity test keeps
 * the two in step. Its own file because both `charges` (which tag a promotion charge buys) and
 * `directory_promotions` use it, and those two schema files import each other's tables.
 */
export const DIRECTORY_PAID_TAG_IDS = ["hot_new", "most_searched", "popular_near_you"] as const;

export const directoryPaidTag = pgEnum("directory_paid_tag", DIRECTORY_PAID_TAG_IDS);
export type DirectoryPaidTag = (typeof DIRECTORY_PAID_TAG_IDS)[number];
