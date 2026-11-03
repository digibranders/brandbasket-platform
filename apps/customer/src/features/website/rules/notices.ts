import { WEBSITE_PATH } from "./paths";

/** Ported from apps/platform lib/website/notices.ts: what /website says after a response to a preview. The query picks a fixed message. */
export type WebsiteNotice = "approved" | "changes-sent" | "not-ready";

export const WEBSITE_NOTICES: Readonly<Record<WebsiteNotice, { readonly text: string; readonly ok: boolean }>> = {
  approved: { text: "Thanks. You approved this preview, and we will be in touch about getting it live.", ok: true },
  "changes-sent": { text: "Thanks. We are making your changes and will email you when the new preview is ready.", ok: true },
  "not-ready": { text: "Nothing sent: there is no preview waiting for your response right now.", ok: false },
};

export function websiteNoticeHref(notice: WebsiteNotice): string {
  return `${WEBSITE_PATH}?response=${notice}`;
}

/** Anything but one of the three names is ignored. */
export function readWebsiteNotice(value: string | string[] | undefined): WebsiteNotice | null {
  return typeof value === "string" && Object.hasOwn(WEBSITE_NOTICES, value) ? (value as WebsiteNotice) : null;
}

/** A viewer reads the Website pages but cannot answer a preview or ask for a domain (the staff-side moves skip row-level security, so this is checked in the action). */
export const VIEWER_MESSAGE = "Only the owner or an editor can do this.";
