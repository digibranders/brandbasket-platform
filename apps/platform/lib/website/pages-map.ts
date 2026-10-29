import { WEBSITE_BLOG_PATH } from "./tabs";

/** A row that points inside the product, where the thing is changed. `href` is a relative path. */
export interface ProductRow {
  readonly label: string;
  readonly line: string;
  readonly href: string;
}

export const PRODUCT_ROWS: readonly ProductRow[] = [
  { label: "Opening hours, holidays and the announcement", line: "Updates your website in about a minute.", href: "/details" },
  { label: "Blog", line: "Write and publish whenever you like.", href: WEBSITE_BLOG_PATH },
];
