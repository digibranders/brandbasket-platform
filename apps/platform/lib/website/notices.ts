import { WEBSITE_PATH } from "@/lib/website/tabs";

/** What /website says after the customer responds to a preview. Fixed messages only: the query parameter picks one. */
export type WebsiteNotice = "approved" | "not-ready";

interface WebsiteNoticeCopy {
  readonly text: string;
  readonly ok: boolean;
}

export const WEBSITE_NOTICES: Readonly<Record<WebsiteNotice, WebsiteNoticeCopy>> = {
  approved: { text: "Thanks. You approved this preview, and we will be in touch about getting it live.", ok: true },
  "not-ready": { text: "Nothing sent: there is no preview waiting for your response right now.", ok: false },
};

export function websiteNoticeHref(notice: WebsiteNotice): string {
  return `${WEBSITE_PATH}?response=${notice}`;
}

export function readWebsiteNotice(value: string | string[] | undefined): WebsiteNotice | null {
  return typeof value === "string" && Object.hasOwn(WEBSITE_NOTICES, value) ? (value as WebsiteNotice) : null;
}
