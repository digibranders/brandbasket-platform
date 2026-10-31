import type { LaunchCheckKey } from "@brandbasket/db";

/** What each launch check says on the staff console, in plain words. Keys come from LAUNCH_CHECK_KEYS in packages/db. */
export const LAUNCH_CHECK_LABELS: Record<LaunchCheckKey, string> = {
  approved_version_identified: "The approved preview is the version being launched",
  production_deployment: "A production deployment exists",
  hostname_configured: "The hostname is added to the website's host",
  dns_and_https: "DNS points at it and HTTPS works",
  key_pages_load: "The homepage and key pages load",
  mobile_checked: "It looks right on a phone",
  contact_paths_work: "The contact form, call and WhatsApp links work",
  customer_informed: "The customer knows the launch plan",
};
