import { BLOG_PATH } from "@/lib/blog/tabs";

/** A thing the customer changes in the dashboard instead of asking us. `href` is a relative path; `line` is a sentence under the label, or null. */
export interface ChangeYourselfItem {
  readonly label: string;
  readonly line: string | null;
  readonly href: string;
}

export const CHANGE_YOURSELF_ITEMS: readonly ChangeYourselfItem[] = [
  { label: "Opening hours, holidays and the announcement", line: null, href: "/details" },
  { label: "Blog", line: "Write and publish whenever you like.", href: BLOG_PATH },
];
