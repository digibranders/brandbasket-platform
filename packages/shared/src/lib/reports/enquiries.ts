/**
 * What counts as an enquiry in a report, in one place so the total can be trusted and compared from month to month.
 * An enquiry is one attempt to contact the business: a form sent, a call tap, a WhatsApp tap, an email tap, a chatbot lead, a call from
 * the Google profile, an ad lead form or message. Directions requests and page views are not enquiries. It counts
 * contacts, not people: someone who contacts the business twice is two.
 *
 * A source that was not measured is left out. It is never counted as zero, because zero would say "we looked and nobody
 * came" when the truth is "we could not see".
 */
export const ENQUIRY_CHANNELS = ["website_form", "website_call", "website_whatsapp", "website_email", "chatbot", "google_profile_call", "ad_lead"] as const;
export type EnquiryChannel = (typeof ENQUIRY_CHANNELS)[number];

export const ENQUIRY_CHANNEL_LABELS: Readonly<Record<EnquiryChannel, string>> = {
  website_form: "Website forms",
  website_call: "Website call taps",
  website_whatsapp: "WhatsApp taps",
  website_email: "Email taps",
  chatbot: "Chatbot",
  google_profile_call: "Google profile calls",
  ad_lead: "Ads: Meta forms and messages",
};

/** A missing or null channel was not measured. */
export type EnquiryCounts = Readonly<Partial<Record<EnquiryChannel, number | null>>>;

export interface EnquiryRow {
  readonly channel: EnquiryChannel;
  readonly label: string;
  readonly count: number;
  /** Share of the measured total, whole percent. */
  readonly sharePercent: number;
}

export interface EnquirySummary {
  readonly total: number;
  /** Measured channels, biggest first (ties in the order of ENQUIRY_CHANNELS). */
  readonly rows: readonly EnquiryRow[];
  readonly included: readonly EnquiryChannel[];
  readonly notMeasured: readonly EnquiryChannel[];
}

export function summariseEnquiries(counts: EnquiryCounts): EnquirySummary {
  const measured: { channel: EnquiryChannel; count: number }[] = [];
  const notMeasured: EnquiryChannel[] = [];
  for (const channel of ENQUIRY_CHANNELS) {
    const count = counts[channel];
    if (count === undefined || count === null) {
      notMeasured.push(channel);
      continue;
    }
    if (!Number.isInteger(count) || count < 0) throw new RangeError(`An enquiry count must be a whole number, zero or more: ${channel} is ${count}`);
    measured.push({ channel, count });
  }
  const total = measured.reduce((sum, row) => sum + row.count, 0);
  const rows = [...measured]
    .sort((a, b) => b.count - a.count)
    .map(({ channel, count }) => ({ channel, label: ENQUIRY_CHANNEL_LABELS[channel], count, sharePercent: total === 0 ? 0 : Math.round((count / total) * 100) }));
  return { total, rows, included: measured.map((row) => row.channel), notMeasured };
}
