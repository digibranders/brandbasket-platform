/**
 * The pure half of the Ads page's "Place an ad" form: reading what staff typed into a staff-placed ad
 * (docs/superpowers/specs/2026-09-30-directory-ads-auction-design.md, "Staff-placed ads"). Staff choose the business,
 * and where and when its ad shows; nothing here limits the ad to the business's own category or area.
 */
import { AD_ALL_SLUG, DIRECTORY_AD_SPOTS, homeMarket, MAX_STAFF_AD_WEEKS, marketOfListing, type DirectoryAdPlacement, type NewStaffAds } from "@fynix/db";
import { AD_MAX_RUPEES, AD_PLACEMENT_LABELS, AD_PLACEMENTS, parseAdLink, parseAdTagline } from "@fynix/shared/lib/directory/ads";
import { isAdCategory, isDirectoryArea, isDirectoryCity } from "@fynix/shared/lib/directory/places";
import { parseMoney } from "@fynix/shared/lib/money";
import { cleanLine } from "@fynix/shared/lib/validation/text";
import { spotLabel } from "./ad-spot-label";
import { listingKeyFromPageAddress } from "./directory-view";

export const STAFF_AD_FIELDS = [
  "kind",
  "link",
  "listing",
  "businessName",
  "tagline",
  "category",
  "area",
  "spot",
  "fromWeek",
  "weeks",
  "price",
  "note",
] as const;
export type StaffAdField = (typeof STAFF_AD_FIELDS)[number];
/** Where a refusal points: any typed field, or the picture (a file, so not one of the typed values). */
export type StaffAdErrorField = StaffAdField | "picture";

/** What an ad leads to: a business's page on the website, or a web address staff typed. */
export const STAFF_AD_KINDS = ["business", "link"] as const;
export type StaffAdKind = (typeof STAFF_AD_KINDS)[number];

/** What was typed, echoed back into the form after a refusal. */
export type StaffAdValues = Readonly<Record<StaffAdField, string>>;

export type StaffAdFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly field: StaffAdErrorField | null; readonly values: StaffAdValues };

export interface StaffAdSpot {
  /** What the form's one select posts: "<placement>:<spot>". */
  readonly value: string;
  readonly label: string;
  readonly placement: DirectoryAdPlacement;
  readonly spot: number;
}

/** Every spot staff can fill, in the order the form lists them: each placement with as many spots as it has. */
export const STAFF_AD_SPOTS: readonly StaffAdSpot[] = AD_PLACEMENTS.flatMap((placement) =>
  Array.from({ length: DIRECTORY_AD_SPOTS[placement] }, (_, index) => ({
    value: `${placement}:${index + 1}`,
    label: spotLabel({ placement, spot: index + 1 }),
    placement,
    spot: index + 1,
  })),
);

/** Reads "<placement>:<spot>" against the spots each placement has; the refusal says what is wrong with it. */
function parseSpot(value: string): { readonly ok: true; readonly spot: StaffAdSpot } | { readonly ok: false; readonly message: string } {
  const [placementText, spotText, ...rest] = value.split(":");
  const placement = AD_PLACEMENTS.find((candidate) => candidate === placementText);
  if (placement === undefined || spotText === undefined || rest.length > 0) return { ok: false, message: "Choose the spot." };
  const spots = DIRECTORY_AD_SPOTS[placement];
  const number = /^[0-9]{1,2}$/.test(spotText) ? Number(spotText) : Number.NaN;
  if (!Number.isInteger(number) || number < 1 || number > spots) {
    return {
      ok: false,
      message: spots === 1 ? `${AD_PLACEMENT_LABELS[placement]} has one spot.` : `${AD_PLACEMENT_LABELS[placement]} has spots 1 to ${spots}.`,
    };
  }
  const spot = STAFF_AD_SPOTS.find((option) => option.placement === placement && option.spot === number);
  return spot === undefined ? { ok: false, message: "Choose the spot." } : { ok: true, spot };
}

const MAX_BUSINESS_NAME_LENGTH = 200;
const MAX_NOTE_LENGTH = 200;
const WEEK_PATTERN = /^\d{4}-\d{2}-\d{2}$/;


type Read<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly message: string };

/** The business's name, or a link ad's headline, as the ad shows it. */
function readName(raw: string, isLink: boolean): Read<string> {
  const value = cleanLine(raw);
  if (value === "") return { ok: false, message: isLink ? "Enter the headline the ad should show." : "Enter the business's name as the ad should show it." };
  if (Array.from(value).length > MAX_BUSINESS_NAME_LENGTH) {
    return { ok: false, message: `Keep the ${isLink ? "headline" : "name"} to ${MAX_BUSINESS_NAME_LENGTH} characters.` };
  }
  return { ok: true, value };
}

/** The agreed weekly price in whole rupees, or none when left empty. */
function readPrice(raw: string): Read<number | null> {
  if (raw.trim() === "") return { ok: true, value: null };
  const paise = parseMoney(raw.replace(/^\s*₹\s*/, ""));
  if (paise === null || paise % 100 !== 0 || paise > AD_MAX_RUPEES * 100) {
    return { ok: false, message: `Enter the weekly price in whole rupees, up to ₹${AD_MAX_RUPEES.toLocaleString("en-IN")}, or leave it empty.` };
  }
  return { ok: true, value: paise };
}

/** The team's note, or none when left empty. */
function readNote(raw: string): Read<string | null> {
  const value = cleanLine(raw);
  if (Array.from(value).length > MAX_NOTE_LENGTH) return { ok: false, message: `Keep the note to ${MAX_NOTE_LENGTH} characters.` };
  return { ok: true, value: value === "" ? null : value };
}

/** What the form places: everything placeStaffAds needs except who placed it and when. */
export type StaffAdInput = Omit<NewStaffAds, "staffId" | "now">;

export type StaffAdParseResult =
  | { readonly success: true; readonly data: StaffAdInput }
  | { readonly success: false; readonly field: StaffAdField; readonly message: string };

/** Every field of a posted form as text: anything missing or not a string reads as blank. */
export function staffAdValuesFrom(read: (name: StaffAdField) => unknown): StaffAdValues {
  const text = (name: StaffAdField): string => {
    const value = read(name);
    return typeof value === "string" ? value : "";
  };
  return {
    kind: text("kind"),
    link: text("link"),
    listing: text("listing"),
    businessName: text("businessName"),
    tagline: text("tagline"),
    category: text("category"),
    area: text("area"),
    spot: text("spot"),
    fromWeek: text("fromWeek"),
    weeks: text("weeks"),
    price: text("price"),
    note: text("note"),
  };
}

function refuse(field: StaffAdField, message: string): StaffAdParseResult {
  return { success: false, field, message };
}

/**
 * The form, checked field by field (the spot first among the where-fields, because a home page ad has no category or
 * area, only a city). A blank category, area or city means the business's own, read from its page address. The starting week is checked for being real here and for not being over when it is placed.
 */
export function parseStaffAdForm(values: StaffAdValues): StaffAdParseResult {
  const isLink = values.kind === "link";

  // A business's own market, read from its page address; a link ad has none, so staff must say where it shows.
  let listingKey: string | null = null;
  let linkUrl: string | null = null;
  let own: ReturnType<typeof marketOfListing> | null = null;
  if (isLink) {
    const link = parseAdLink(values.link);
    if (!link.ok) return refuse("link", link.message);
    linkUrl = link.url;
  } else {
    if (values.listing.trim() === "") return refuse("listing", "Paste the address of the business's page on the website.");
    listingKey = listingKeyFromPageAddress(values.listing);
    if (listingKey === null) {
      return refuse("listing", "That isn't a business page. It looks like fynix.digital/in/mh/business/smile-dental/9f94ykmdjp.");
    }
    own = marketOfListing(listingKey);
  }

  const name = readName(values.businessName, isLink);
  if (!name.ok) return refuse("businessName", name.message);
  const businessName = name.value;

  const tagline = parseAdTagline(values.tagline);
  if (!tagline.ok) return refuse("tagline", tagline.message);

  const parsedSpot = parseSpot(values.spot);
  if (!parsedSpot.ok) return refuse("spot", parsedSpot.message);
  const spot = parsedSpot.spot;

  let market: StaffAdInput["market"];
  if (spot.placement === "home") {
    // A home page ad belongs to a city, not to a category or area: the city is the one chosen, else the business's own.
    const citySlug = values.area === "" ? own?.citySlug : values.area.split("/")[0];
    if (citySlug === undefined || !isDirectoryCity(citySlug)) return refuse("area", "Choose the city whose home page it shows on.");
    market = homeMarket(citySlug);
  } else {
    const categorySlug = values.category === "" ? own?.categorySlug : values.category;
    // Ads run only on a category with its own website page (a business's own category may not have one yet), or on all of them.
    if (categorySlug === undefined || (categorySlug !== AD_ALL_SLUG && !isAdCategory(categorySlug))) {
      return refuse(
        "category",
        values.category === "" && own !== null ? "This business's category has no page on the website yet. Choose one from the list." : "Choose a category from the list.",
      );
    }
    const [citySlug, areaSlug] = values.area === "" ? [own?.citySlug, own?.areaSlug] : values.area.split("/");
    // "<city>/all" is every area of the city; any other area must be one of that city's.
    const knownArea = citySlug !== undefined && (areaSlug === AD_ALL_SLUG ? isDirectoryCity(citySlug) : areaSlug !== undefined && isDirectoryArea(citySlug, areaSlug));
    if (citySlug === undefined || areaSlug === undefined || (values.area !== "" && !knownArea)) {
      return refuse("area", "Choose an area from the list.");
    }
    market = { categorySlug, citySlug, areaSlug };
  }

  if (!WEEK_PATTERN.test(values.fromWeek) || new Date(`${values.fromWeek}T00:00:00.000Z`).getUTCDay() !== 1) {
    return refuse("fromWeek", "Choose the week the ad starts.");
  }

  const weeks = /^[0-9]{1,2}$/.test(values.weeks.trim()) ? Number(values.weeks.trim()) : Number.NaN;
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > MAX_STAFF_AD_WEEKS) {
    return refuse("weeks", `Enter how many weeks, from 1 to ${MAX_STAFF_AD_WEEKS}.`);
  }

  const price = readPrice(values.price);
  if (!price.ok) return refuse("price", price.message);
  const agreedPaise = price.value;

  const noteText = readNote(values.note);
  if (!noteText.ok) return refuse("note", noteText.message);
  const note = noteText.value;

  return {
    success: true,
    data: {
      listingKey,
      linkUrl,
      businessName,
      tagline: tagline.tagline,
      market,
      placement: spot.placement,
      spot: spot.spot,
      fromWeek: values.fromWeek,
      weeks,
      agreedPaise,
      note,
    },
  };
}

// ---------------------------------------------------------------------------------------------------------------
// Editing a booking
// ---------------------------------------------------------------------------------------------------------------

export const STAFF_AD_EDIT_FIELDS = ["businessName", "tagline", "link", "price", "note"] as const;
export type StaffAdEditField = (typeof STAFF_AD_EDIT_FIELDS)[number];
/** Where a refusal of the edit points: a typed field, or the new picture. */
export type StaffAdEditErrorField = StaffAdEditField | "picture";
export type StaffAdEditValues = Readonly<Record<StaffAdEditField, string>>;

export type StaffAdEditFormState =
  | { readonly status: "idle" }
  | { readonly status: "error"; readonly message: string; readonly field: StaffAdEditErrorField | null; readonly values: StaffAdEditValues };

/** What an edit changes on a booking: what it says and leads to, and the team's own price and note. */
export interface StaffAdEditInput {
  readonly businessName: string;
  readonly tagline: string | null;
  /** The address a link ad leads to; null for an ad for a business's page. */
  readonly linkUrl: string | null;
  readonly agreedPaise: number | null;
  readonly note: string | null;
}

export type StaffAdEditParseResult =
  | { readonly success: true; readonly data: StaffAdEditInput }
  | { readonly success: false; readonly field: StaffAdEditField; readonly message: string };

/** Every field of a posted edit form as text: anything missing or not a string reads as blank. */
export function staffAdEditValuesFrom(read: (name: StaffAdEditField) => unknown): StaffAdEditValues {
  const text = (name: StaffAdEditField): string => {
    const value = read(name);
    return typeof value === "string" ? value : "";
  };
  return { businessName: text("businessName"), tagline: text("tagline"), link: text("link"), price: text("price"), note: text("note") };
}

/**
 * The edit form, checked field by field with the same rules as placing the ad. `isLink` is whether the booking is a
 * link ad, which the database says, not the form: a link ad must keep an address, and an ad for a business has none.
 */
export function parseStaffAdEdit(values: StaffAdEditValues, { isLink }: { readonly isLink: boolean }): StaffAdEditParseResult {
  let linkUrl: string | null = null;
  if (isLink) {
    const link = parseAdLink(values.link);
    if (!link.ok) return { success: false, field: "link", message: link.message };
    linkUrl = link.url;
  }
  const name = readName(values.businessName, isLink);
  if (!name.ok) return { success: false, field: "businessName", message: name.message };
  const tagline = parseAdTagline(values.tagline);
  if (!tagline.ok) return { success: false, field: "tagline", message: tagline.message };
  const price = readPrice(values.price);
  if (!price.ok) return { success: false, field: "price", message: price.message };
  const note = readNote(values.note);
  if (!note.ok) return { success: false, field: "note", message: note.message };
  return { success: true, data: { businessName: name.value, tagline: tagline.tagline, linkUrl, agreedPaise: price.value, note: note.value } };
}
