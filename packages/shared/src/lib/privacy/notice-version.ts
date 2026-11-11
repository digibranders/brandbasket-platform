/**
 * Which published text a person agreed to. Stored on every consent record (DPDP Act 2023 s.6, r.3) so Brandbasket can
 * show which Terms and Privacy Notice were on screen when they ticked the box.
 *
 * "pre-dpdp" named the texts published before 13 October 2026. The label now matches the website's (lib/legal-version.ts
 * there), which must change in the same release: a sign-up that records one label while the page shows another text is
 * wrong proof. Change it to a new dated version in the same change that publishes a new Terms or Privacy Notice, and never
 * reuse a label. The website owns the text itself; this is only its label. "2026-10-13.2" is that day's second text,
 * when the Contact page form replaced Get started.
 * "2026-10-13.3": the Privacy Policy links the privacy request form, and says how to delete a post from its business page
 * and report a post or a listing from its Report link.
 * "2026-10-13.4": the Refund and Cancellation Policy is published; the Terms name the courts at Thane and add the rules
 * for customers' personal data and for reviews and comments; the Privacy Policy says a reviewer can let the business
 * contact them.
 * "2026-10-13.5": the Privacy Policy states the approved retention periods, is published in Hindi at /privacy/hi, and
 * offers it in any language of the Eighth Schedule.
 * "2026-11-06.1": the Terms name Website Management, Social Media Management and Paid Ads Management (Local SEO + AEO is no
 * longer sold) and Dedicated Expert Monitoring, included with all three plans or priced monthly with one or two. The labels
 * the website published between 2026-10-19.1 and 2026-10-28.3 were never copied here; this one is.
 */
export const LEGAL_TEXT_VERSION = "2026-11-06.1";
