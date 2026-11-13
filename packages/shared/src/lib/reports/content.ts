import { z } from "zod";

/**
 * What a stored report document holds, version 1. compose.test.ts checks the composers' output against this schema.
 * Every figure is already worded and formatted when the report is frozen, with its unit and its month or date in the label or the value.
 */
export const REPORT_CONTENT_VERSION = 1;

export const reportContentSchema = z.object({
  /** One plain sentence about the month for this service. */
  headline: z.string().trim().min(1).max(400),
  figures: z.array(z.object({ label: z.string().trim().min(1).max(60), value: z.string().trim().min(1).max(40) })).min(1).max(8),
  /** What we did this month, one line each, oldest first. */
  whatWeDid: z.array(z.string().trim().min(1).max(300)).max(20),
  /** Ranked lists (top searches, most viewed pages, where enquiries came from). Added after the first readers shipped, so a reader that does not know it ignores it. */
  lists: z
    .array(z.object({ title: z.string().trim().min(1).max(60), rows: z.array(z.object({ label: z.string().trim().min(1).max(120), value: z.string().trim().min(1).max(40) })).min(1).max(10) }))
    .max(4)
    .optional(),
});
export type ReportContent = z.infer<typeof reportContentSchema>;
export type ReportFigure = ReportContent["figures"][number];
export type ReportList = NonNullable<ReportContent["lists"]>[number];
