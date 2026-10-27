import { isHttpsAddress, todayInIndia } from "@/lib/deliverable-form";

export type ReportParse =
  | { readonly success: true; readonly data: { readonly service: "social" | "search"; readonly month: string; readonly url: string } }
  | { readonly success: false; readonly message: string };

/** Checks the form that adds a monthly report's link. The month is stored as its first day. */
export function parseReportForm(fields: Readonly<Record<string, string>>, now: Date): ReportParse {
  const service = fields["service"];
  if (service !== "social" && service !== "search") return { success: false, message: "Choose Social & Ads or Search." };
  const month = fields["month"] ?? "";
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return { success: false, message: "Choose a month." };
  if (month > todayInIndia(now).slice(0, 7)) return { success: false, message: "Choose this month or an earlier one." };
  const url = (fields["url"] ?? "").trim();
  if (!isHttpsAddress(url)) return { success: false, message: "The report link must start with https:// and be 500 characters or fewer." };
  return { success: true, data: { service, month: `${month}-01`, url } };
}
