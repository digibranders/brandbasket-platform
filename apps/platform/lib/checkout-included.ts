/**
 * What each part of the Care payment includes, as the order summary's two "What's included" dropdowns list it: the website
 * (free with the plan) and the monthly maintenance (what the plan's price pays for). Each line has the icon drawn beside it
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
  { icon: "pages", text: "Up to 5 pages" },
  { icon: "mobile", text: "Mobile-friendly (works on all devices)" },
  { icon: "enquiries", text: "Enquiry forms and click-to-call" },
  { icon: "local-seo", text: "Local SEO foundation" },
  { icon: "chatbot", text: "OyeChats professional chatbot" },
];

export const MAINTENANCE_INCLUDED: readonly IncludedItem[] = [
  { icon: "security", text: "Security monitoring" },
  { icon: "performance", text: "Performance monitoring" },
  { icon: "hosting", text: "Hosting and uptime monitoring" },
  { icon: "updates", text: "Routine updates and upkeep" },
  { icon: "report", text: "Monthly health report" },
];
