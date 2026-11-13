import { z } from "zod";

/** The hard ceiling on brands under one business, as social-auto holds it. The page never offers more, whatever it is told. */
export const BRAND_CEILING = 4;

/** The cookie that remembers which brand the customer is looking at, in this browser. */
export const BRAND_COOKIE = "bb_social_brand";

/** One brand of a business: a workspace in social-auto. The first brand is the business itself, under the business's own id. */
export interface Brand {
  readonly externalId: string;
  readonly name: string;
  readonly website: string | null;
  readonly archived: boolean;
}

/** The business's brands and how many it may have. */
export interface BrandsView {
  readonly brands: readonly Brand[];
  readonly allowed: number;
  /** How many of them are not archived. */
  readonly used: number;
}

const brandSchema = z.object({ externalId: z.string().min(1), name: z.string().nullish(), website: z.string().nullish(), archived: z.boolean().optional() });

/**
 * The brands of a group answer (`{ workspaces: [...], brandsAllowed, brandsUsed }`), or null when it is not that, as an answer from a
 * posting service that does not know brands yet is not. The allowance is never taken above the ceiling.
 */
export function readBrands(body: unknown, fallbackName: string): BrandsView | null {
  const raw = body as { workspaces?: unknown; brandsAllowed?: unknown; brandsUsed?: unknown } | null;
  if (!Array.isArray(raw?.workspaces)) return null;
  const brands = raw.workspaces.flatMap((item): Brand[] => {
    const parsed = brandSchema.safeParse(item);
    return parsed.success ? [{ externalId: parsed.data.externalId, name: parsed.data.name?.trim() || fallbackName, website: parsed.data.website?.trim() || null, archived: parsed.data.archived === true }] : [];
  });
  const allowed = typeof raw.brandsAllowed === "number" && Number.isInteger(raw.brandsAllowed) ? Math.min(Math.max(raw.brandsAllowed, 1), BRAND_CEILING) : 1;
  const used = typeof raw.brandsUsed === "number" && Number.isInteger(raw.brandsUsed) ? raw.brandsUsed : brands.filter((brand) => !brand.archived).length;
  return { brands, allowed, used };
}

/**
 * The brand to show: the one the customer chose when it is one of the business's own and not archived, else the business's first brand,
 * else the first that is not archived. A choice that is not in the business's own list is ignored, so nobody reaches another business's brand.
 */
export function chooseBrand(view: BrandsView, businessId: string, chosen: string | undefined): Brand | null {
  const live = view.brands.filter((brand) => !brand.archived);
  return live.find((brand) => brand.externalId === chosen) ?? live.find((brand) => brand.externalId === businessId) ?? live[0] ?? null;
}

const KEY_LENGTH = 8;
const KEY_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";

/** The key that makes a further brand's id, `<business id>:<key>`: eight lowercase letters and digits, from the given random bytes. */
export function brandKeyFrom(bytes: Uint8Array): string {
  return Array.from(bytes.slice(0, KEY_LENGTH), (byte) => KEY_CHARS[byte % KEY_CHARS.length]).join("");
}

export const brandIdFor = (businessId: string, key: string): string => `${businessId}:${key}`;

/** Whether a brand id belongs to the business: its own id, or the id followed by `:` and a key. */
export const isBrandOf = (businessId: string, externalId: string): boolean => externalId === businessId || (externalId.startsWith(`${businessId}:`) && externalId.length > businessId.length + 1);
