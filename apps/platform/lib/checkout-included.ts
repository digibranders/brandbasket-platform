/**
 * What the Managed Website line includes, as the order summary's "What's included" dropdown lists it: the website (built
 * free) and the monthly management (what the line's price pays for). Each item has the icon drawn beside it
 * (components/panel/membership/included-list.tsx).
 */

export type IncludedIcon =
  | "design"
  | "pages"
  | "mobile"
  | "enquiries"
  | "local-seo"
  | "chatbot"
  | "security"
  | "performance"
  | "hosting"
  | "updates"
  | "report";

export interface IncludedItem {
  readonly icon: IncludedIcon;
  readonly text: string;
}

export const WEBSITE_INCLUDED: readonly IncludedItem[] = [
  { icon: "design", text: "Professional design" },
  { icon: "pages", text: "Up to 10 pages" },
  { icon: "mobile", text: "Mobile-friendly (works on all devices)" },
  { icon: "enquiries", text: "Enquiry forms and click-to-call" },
  { icon: "local-seo", text: "Local SEO foundation" },
  { icon: "chatbot", text: "OyeChats professional chatbot" },
];

export const MAINTENANCE_INCLUDED: readonly IncludedItem[] = [
  { icon: "hosting", text: "Hosting, SSL and uptime monitoring" },
  { icon: "security", text: "Security checks, backups and maintenance" },
  { icon: "performance", text: "Bug fixes and small mobile fixes" },
  { icon: "updates", text: "2 small content edits a month" },
  { icon: "report", text: "Monthly health report" },
];

/** Everything the Managed Website line pays for, the website's points then the monthly management's. */
export const MANAGED_WEBSITE_INCLUDED: readonly IncludedItem[] = [...WEBSITE_INCLUDED, ...MAINTENANCE_INCLUDED];
