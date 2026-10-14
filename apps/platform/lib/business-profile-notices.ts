import type { PublishRefusal } from "@fynix/db";
import type { PageTabLabels } from "@fynix/shared/lib/directory/page-tabs";

/*
 * What the Business profile says after an action (docs/superpowers/specs/2026-10-01-business-profile-design.md). Each
 * action redirects to `/business?tab=<tab>&notice=<code>`, and the page reads the code back. Codes, not messages, so
 * nothing typed into the address bar is ever shown. Browser-safe (the db import is a type).
 */

/** The page every Business profile link and redirect goes to (LISTING_PAGE_PATH in lib/server/customer-access.ts). */
export const BUSINESS_PROFILE_PATH = "/business";

export type ProfileNotice =
  | "details-saved"
  | "service-saved"
  | "service-saved-tab"
  | "service-removed"
  | "product-saved"
  | "product-saved-tab"
  | "product-removed"
  | "product-photo-removed"
  | "faq-saved"
  | "faq-saved-tab"
  | "faq-removed"
  | "contact-saved"
  | "trust-saved"
  | "trust-saved-tab"
  | "page-tabs-saved"
  | "refused"
  | "publish-no-photo"
  | "listing-added"
  | "listing-saved"
  | "categories-saved"
  | "photo-removed"
  | "photo-moved"
  | "video-saved"
  | "video-removed"
  | "clip-removed"
  | "clip-featured"
  | "clip-unfeatured"
  | "clip-feature-failed"
  | "video-invalid"
  | "needs-details"
  | "published"
  | "verified"
  | "google-imported"
  | "google-failed"
  | "google-empty"
  | "google-off"
  | "invalid"
  | `publish-${PublishRefusal}`;

export interface NoticeText {
  readonly ok: boolean;
  readonly text: string;
}

export const PROFILE_NOTICES: Readonly<Record<ProfileNotice, NoticeText>> = {
  "details-saved": { ok: true, text: "Identity saved." },
  "service-saved": { ok: true, text: "Service saved." },
  "service-saved-tab": { ok: true, text: "Service saved. Your page now has a Services tab. You can turn it off under Page tabs." },
  "service-removed": { ok: true, text: "Service removed." },
  "product-saved": { ok: true, text: "Product saved." },
  "product-saved-tab": { ok: true, text: "Product saved. Your page now has a Products tab. You can turn it off under Page tabs." },
  "product-removed": { ok: true, text: "Product removed." },
  "product-photo-removed": { ok: true, text: "Photo removed." },
  "faq-saved": { ok: true, text: "Question saved." },
  "faq-saved-tab": { ok: true, text: "Question saved. Your page now has an FAQ tab. You can turn it off under Page tabs." },
  "faq-removed": { ok: true, text: "Question removed." },
  "contact-saved": { ok: true, text: "Contact options saved." },
  "trust-saved": { ok: true, text: "Trust information saved." },
  "trust-saved-tab": { ok: true, text: "Trust information saved. Your page now has a Good to know tab. You can turn it off under Page tabs." },
  "page-tabs-saved": { ok: true, text: "Page tabs saved. Your page shows them now." },
  refused: { ok: false, text: "That couldn't be saved. Check what you entered and try again." },
  "publish-no-photo": { ok: false, text: "Add a feature photo on the Photos tab first. Your page needs one before it goes live." },
  "listing-added": { ok: true, text: "Your business has its Business ID. Check everything, then publish." },
  "listing-saved": { ok: true, text: "Listing saved." },
  "categories-saved": { ok: true, text: "Your categories are saved." },
  "photo-removed": { ok: true, text: "Photo removed." },
  "photo-moved": { ok: true, text: "Photo moved." },
  "video-saved": { ok: true, text: "Video saved." },
  "video-removed": { ok: true, text: "Video removed." },
  "clip-removed": { ok: true, text: "Video removed. It stops showing on your page within a minute." },
  "clip-featured": { ok: true, text: "Your video now shows at the top of your page. It can take up to a minute to appear." },
  "clip-unfeatured": { ok: true, text: "Your video no longer shows at the top of your page." },
  "clip-feature-failed": { ok: false, text: "We couldn't change that. The video may have been removed, so reload the page and try again." },
  "video-invalid": { ok: false, text: "Paste the link to one YouTube video, like youtube.com/watch?v=… or youtu.be/…." },
  "needs-details": { ok: false, text: "Save your Identity first, then add the video." },
  published: { ok: true, text: "Your business is live on the local directory." },
  verified: { ok: true, text: "Your business is verified." },
  "google-imported": { ok: true, text: "We found your Google Business Profile. Check the details below, then save." },
  "google-failed": { ok: false, text: "We couldn't read your Google Business Profile. Try again, or fill in the details yourself." },
  "google-empty": { ok: false, text: "That Google account doesn't manage any business locations." },
  "google-off": { ok: false, text: "Importing from Google isn't switched on yet. Fill in the details yourself for now." },
  invalid: { ok: false, text: "That didn't work. Reload the page and try again." },
  "publish-no-claim": { ok: false, text: "Choose where you're listed on the Listing tab first." },
  "publish-not-added": { ok: false, text: "We confirm this listing with a call, so it has no Publish." },
  "publish-already-published": { ok: true, text: "Your business is already live." },
  "publish-taken-down": { ok: false, text: "This business was taken off the local directory. Email us and we'll sort it out." },
  "publish-owner-unconfirmed": { ok: false, text: "Confirm your email address first: open the link we sent you, then publish." },
  "publish-listing-taken": { ok: false, text: "Another business already has this listing. Email us and we'll sort it out." },
};

/** The notices about a service or a product, which say "Menu" instead once the owner has named that tab. */
function namedNotice(code: ProfileNotice, labels: PageTabLabels): NoticeText | null {
  const tab = code.startsWith("service-") ? "services" : code.startsWith("product-") && code !== "product-photo-removed" ? "products" : null;
  const name = tab === null ? undefined : labels[tab];
  if (name === undefined) return null;
  if (code === "service-saved" || code === "product-saved") return { ok: true, text: `Saved to ${name}.` };
  if (code === "service-saved-tab" || code === "product-saved-tab") {
    return { ok: true, text: `Saved to ${name}. Your page now has a ${name} tab. You can turn it off under Page tabs.` };
  }
  if (code === "service-removed" || code === "product-removed") return { ok: true, text: `Removed from ${name}.` };
  return null;
}

/** The notice for `code`, or null when it is not one of ours. `labels` are the names the owner gave the Services and Products tabs. */
export function readProfileNotice(code: string | string[] | undefined, labels: PageTabLabels = {}): NoticeText | null {
  if (typeof code !== "string" || !Object.hasOwn(PROFILE_NOTICES, code)) return null;
  const known = code as ProfileNotice;
  return namedNotice(known, labels) ?? PROFILE_NOTICES[known];
}

/** A link to one tab, with a notice to show once there. */
export function profileHref(tab: string, notice?: ProfileNotice): string {
  const params = new URLSearchParams({ tab });
  if (notice !== undefined) params.set("notice", notice);
  return `${BUSINESS_PROFILE_PATH}?${params.toString()}`;
}
