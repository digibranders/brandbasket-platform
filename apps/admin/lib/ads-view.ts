/**
 * Which part of the Ads page is showing, read from and written to its URL, so the page, its pills, its paging links
 * and its actions' redirects all agree. `/ads` alone is the pending claims, page 1.
 */

export const ADS_PAGE_SIZE = 25;

export const CLAIM_FILTERS = ["pending", "tagline", "approved"] as const;
export type ClaimFilter = (typeof CLAIM_FILTERS)[number];

/** Listing owners' pictures by where they stand: waiting for a check, showing, or refused. */
export const PICTURE_FILTERS = ["pending", "approved", "rejected"] as const;
export type PictureFilter = (typeof PICTURE_FILTERS)[number];

export type AdsView =
  | { readonly section: "claims"; readonly status: ClaimFilter; readonly page: number }
  /** Pictures listing owners uploaded, to approve, refuse or take down. */
  | { readonly section: "pictures"; readonly status: PictureFilter; readonly page: number }
  /** Videos Premium members uploaded. They go live at once, so this is one list of what is live, to take down. */
  | { readonly section: "videos"; readonly page: number }
  | { readonly section: "auctions" }
  /** Ads staff placed by hand, and the form to place one; `edit` is the first week's id of the booking being edited. */
  | { readonly section: "placed"; readonly edit?: string }
  | { readonly section: "prices" };

export const ADS_NOTICE_KEYS = [
  "approved",
  "listing_taken",
  "tagline_approved",
  "picture_approved",
  "picture_rejected",
  "picture_removed",
  "video_removed",
  "price_saved",
  "price_removed",
  "price_invalid",
  "spot_price_saved",
  "spot_price_removed",
  "spot_price_invalid",
  "placed",
  "ad_edited",
  "ad_removed",
  "claim_changed",
  "email_unconfirmed",
  "unchanged",
] as const;
export type AdsNotice = (typeof ADS_NOTICE_KEYS)[number];

/** What the page says after an action. Fixed messages only: the query parameter picks one, nothing more. */
export const ADS_NOTICES: Readonly<Record<AdsNotice, { readonly text: string; readonly ok: boolean }>> = {
  approved: { text: "Approved. A claimed listing is verified and can bid now; a new business's page goes up within a couple of minutes.", ok: true },
  listing_taken: { text: "Not approved: another account already owns this listing.", ok: false },
  tagline_approved: { text: "Line approved. It shows on their ads within a minute.", ok: true },
  picture_approved: { text: "Picture approved. It shows on the website within a minute.", ok: true },
  picture_rejected: { text: "Picture refused. The owner sees it as not accepted and can upload another.", ok: true },
  picture_removed: { text: "Picture taken down. The website goes back to what it showed before.", ok: true },
  video_removed: { text: "Video taken down. The business's page stops showing it.", ok: true },
  price_saved: { text: "Price saved. New bids start from it.", ok: true },
  price_removed: { text: "Category closed to new bids. Bids already placed still settle.", ok: true },
  price_invalid: { text: "Nothing saved: choose a category and enter whole rupees from ₹100 to ₹1,00,000.", ok: false },
  spot_price_saved: { text: "Price saved. New bids on that placement start from it.", ok: true },
  spot_price_removed: { text: "Placement closed to new bids. Bids already placed still settle.", ok: true },
  spot_price_invalid: { text: "Nothing saved: enter whole rupees from ₹100 to ₹1,00,000, and for a business page choose a category.", ok: false },
  placed: { text: "Ad placed. It shows on the website from the start of its first week, usually within a minute: reload the page once or twice if it still shows the old one.", ok: true },
  ad_edited: { text: "Ad updated. The website shows the change within a minute: reload the page once or twice if it still shows the old one.", ok: true },
  ad_removed: { text: "Ad taken down. Its spot is free again.", ok: true },
  claim_changed: { text: "Not approved: the owner changed these details after you opened this page. Check them again, and call again if the number is new.", ok: false },
  email_unconfirmed: {
    text: "Not approved: the owner hasn't confirmed their email yet. Ask them to open the link we emailed, or to send it again from their dashboard.",
    ok: false,
  },
  unchanged: { text: "Nothing changed: someone got there first.", ok: false },
};

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** Pages beyond this are not real use; the cap keeps a hand-typed URL's offset query cheap. */
const MAX_PAGE = 10_000;

type ParamValue = string | readonly string[] | null | undefined;

function first(value: ParamValue): string | undefined {
  if (value === null || value === undefined) return undefined;
  return typeof value === "string" ? value : value[0];
}

function parsePage(value: ParamValue): number {
  const raw = first(value);
  if (raw === undefined || !/^[1-9][0-9]{0,4}$/.test(raw)) return 1;
  return Math.min(Number(raw), MAX_PAGE);
}

export function parseAdsView(read: (name: string) => ParamValue): AdsView {
  const section = first(read("show"));
  if (section === "auctions") return { section: "auctions" };
  if (section === "placed") {
    const edit = first(read("edit"));
    return edit !== undefined && UUID_PATTERN.test(edit) ? { section: "placed", edit } : { section: "placed" };
  }
  if (section === "prices") return { section: "prices" };
  const status = first(read("status"));
  if (section === "pictures") {
    const filter = PICTURE_FILTERS.find((candidate) => candidate === status) ?? "pending";
    return { section: "pictures", status: filter, page: parsePage(read("page")) };
  }
  if (section === "videos") return { section: "videos", page: parsePage(read("page")) };
  const filter = CLAIM_FILTERS.find((candidate) => candidate === status) ?? "pending";
  return { section: "claims", status: filter, page: parsePage(read("page")) };
}

export function parseAdsNotice(value: ParamValue): AdsNotice | null {
  const raw = first(value);
  return ADS_NOTICE_KEYS.find((key) => key === raw) ?? null;
}

/** The page's address for `view`, with an optional notice; the defaults are left out. */
export function adsHref(view: AdsView, notice?: AdsNotice): string {
  const params = new URLSearchParams();
  if (view.section !== "claims") params.set("show", view.section);
  if (view.section === "claims" || view.section === "pictures") {
    if (view.status !== "pending") params.set("status", view.status);
    if (view.page > 1) params.set("page", String(view.page));
  }
  if (view.section === "videos" && view.page > 1) params.set("page", String(view.page));
  if (view.section === "placed" && view.edit !== undefined) params.set("edit", view.edit);
  if (notice !== undefined) params.set("done", notice);
  const query = params.toString();
  return query === "" ? "/ads" : `/ads?${query}`;
}
