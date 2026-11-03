import { z } from "zod";

/**
 * What a stored report document holds, version 1. The customer app reads it with a schema of its own
 * (apps/customer/src/features/reports/rules.ts); the two must keep the same limits, and compose.test.ts checks the composers' output against these.
 * Every figure is already worded and formatted when the report is frozen, with its unit and its month or date in the label or the value.
 */
export const REPORT_CONTENT_VERSION = 1;

export const reportContentSchema = z.object({
  /** One plain sentence about the month for this service. */
  headline: z.string().trim().min(1).max(400),
  figures: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(40) })).min(1).max(8),
  /** What we did this month, one line each, oldest first. */
  whatWeDid: z.array(z.string().trim().min(1).max(300)).max(20),
});
export type ReportContent = z.infer<typeof reportContentSchema>;
export type ReportFigure = ReportContent["figures"][number];
