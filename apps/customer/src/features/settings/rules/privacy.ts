import { BRAND } from "@/features/entry/rules/brand";

/** Where the data download is served (the old path, kept for emails and bookmarks). */
export const PRIVACY_EXPORT_PATH = "/settings/privacy/export";

/** The link behind Make a privacy request. Brandbasket's website has no request form, so it is a mailto (PARITY, settings, 23). */
export function privacyRequestHref(): string {
  return `mailto:${BRAND.contactEmail}`;
}
