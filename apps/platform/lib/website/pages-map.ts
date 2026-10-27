import { WEBSITE_BLOG_PATH } from "./tabs";

/** A page the live site shows. `path` is where it sits on the site; `line` says what it shows. */
export interface SitePage {
  readonly name: string;
  readonly path: string;
  readonly line: string;
}

/** A row that points inside the product, where the thing is changed. `href` is a relative path. */
export interface ProductRow {
  readonly label: string;
  readonly line: string;
  readonly href: string;
}

/** Paths assumed from the website template; confirm before this ships (plan 33, Verify first 6). */
export const SITE_PAGES: readonly SitePage[] = [
  { name: "Home", path: "/", line: "The first page visitors see, with your main offer." },
  { name: "About", path: "/about", line: "Who you are and how long you have been doing it." },
  { name: "Services", path: "/services", line: "What you offer, with a short line on each." },
  { name: "Contact", path: "/contact", line: "How to reach you: phone, email and address." },
];

export const PRODUCT_ROWS: readonly ProductRow[] = [
  { label: "Opening hours, holidays and the announcement", line: "Updates your website in about a minute.", href: "/details" },
  { label: "Blog", line: "Write and publish whenever you like.", href: WEBSITE_BLOG_PATH },
];
