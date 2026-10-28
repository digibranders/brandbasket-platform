import { compare } from "./delta";

/**
 * The one sentence a report opens with. It is built only from figures that were measured, in fixed words, so the same
 * numbers always read the same and nothing is promised that the data does not show. It comes as segments so the dashboard
 * can highlight the figures while the email and the PDF use plain text.
 */
export interface HeadlineSegment {
  readonly text: string;
  readonly emphasis?: true;
}

/** The share of the month below which a site counts as down more than it should be. */
const UPTIME_FLOOR_PERCENT = 99.5;

export interface WebsiteHeadlineInput {
  readonly uptimePercent: number | null;
  readonly enquiries: number | null;
  readonly previousEnquiries: number | null;
  /** Null for a first month. */
  readonly previousMonthName: string | null;
}

const plain = (text: string): HeadlineSegment => ({ text });
const strong = (text: string): HeadlineSegment => ({ text, emphasis: true });

/** 99.96 stays 99.96, 100 becomes 100, 99.90 becomes 99.9. */
const percent = (value: number): string => `${Number(value.toFixed(2))}%`;

function comparison(enquiries: number, previousEnquiries: number | null, previousMonthName: string | null): string {
  const delta = previousMonthName === null ? null : compare(enquiries, previousEnquiries);
  if (delta === null) return "";
  if (delta.direction === "same") return `, the same as in ${previousMonthName}`;
  return `, ${delta.amount} ${delta.direction === "up" ? "more" : "fewer"} than in ${previousMonthName}`;
}

export function websiteHeadline({ uptimePercent, enquiries, previousEnquiries, previousMonthName }: WebsiteHeadlineInput): HeadlineSegment[] | null {
  if (uptimePercent === null && enquiries === null) return null;
  const segments: HeadlineSegment[] = [];
  if (uptimePercent !== null) {
    segments.push(plain("Your website was online "), strong(percent(uptimePercent)));
    const low = uptimePercent < UPTIME_FLOOR_PERCENT ? ", which is lower than we want," : "";
    segments.push(plain(enquiries === null ? " of the month" : ` of the month${low} and sent you `));
  } else {
    segments.push(plain("Your website sent you "));
  }
  if (enquiries !== null) {
    segments.push(strong(`${enquiries} ${enquiries === 1 ? "enquiry" : "enquiries"}`), plain(comparison(enquiries, previousEnquiries, previousMonthName)));
  }
  const last = segments[segments.length - 1] as HeadlineSegment;
  segments[segments.length - 1] = { ...last, text: `${last.text}.` };
  return segments;
}

export function headlineText(segments: readonly HeadlineSegment[]): string {
  return segments.map((segment) => segment.text).join("");
}
