import type { ReportService } from "@brandbasket/db";

/** The service names a customer reads, as the customer app's menu words them. */
export const REPORT_SERVICE_TITLES: Readonly<Record<ReportService, string>> = {
  website: "Website",
  social: "Social & Ads",
  search: "Local SEO + AEO",
};
