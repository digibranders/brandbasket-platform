import { emailBrandName } from "../brand";
import { emailGreeting } from "../format";
import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph, receiptRows } from "../receipt";

export interface MonthlyReportInput {
  readonly to: string;
  /** The customer's full name; only the first word is used. Null for a greeting without a name. */
  readonly name: string | null;
  /** The service as the customer reads it: "Website", "Social & Ads" or "Local SEO + AEO". */
  readonly serviceTitle: string;
  /** "October 2026". */
  readonly monthTitle: string;
  /** The report's one sentence. */
  readonly headline: string;
  /** The first figures of the report, already worded: at most three are shown. */
  readonly figures: readonly { readonly label: string; readonly value: string }[];
  /** Where the customer reads the report: an absolute address on the customer app. */
  readonly reportUrl: string;
  /** Where the customer downloads the PDF of this report: an absolute address on the customer app. */
  readonly pdfUrl: string;
}

const SHOWN_FIGURES = 3;

/** Sent when staff send a customer's monthly report. The figures are the report's own; nothing is worked out here. */
export function monthlyReportEmail(input: MonthlyReportInput): EmailMessage {
  const reportUrl = assertWebUrl(input.reportUrl, "reportUrl");
  const pdfUrl = assertWebUrl(input.pdfUrl, "pdfUrl");
  const subject = sanitizeHeaderValue(`Your ${input.serviceTitle} report for ${input.monthTitle}`);
  const figures = input.figures.slice(0, SHOWN_FIGURES);
  const intro = `Your ${input.serviceTitle} report for ${input.monthTitle} is ready.`;
  const link = `Read the full report: ${reportUrl}\n\nDownload the PDF: ${pdfUrl}`;
  const signOff = emailBrandName();

  return {
    to: sanitizeHeaderValue(input.to),
    subject,
    template: "monthly-report",
    bodyText: [emailGreeting(input.name), intro, input.headline, ...figures.map((figure) => `${figure.label}: ${figure.value}`), link, signOff].join("\n\n"),
    bodyHtml: receiptDocument({
      title: subject,
      kicker: "Monthly report",
      heading: subject,
      body: [
        receiptParagraph(emailGreeting(input.name)),
        receiptParagraph(intro),
        receiptParagraph(input.headline),
        ...(figures.length === 0 ? [] : [receiptRows(figures.map((figure) => ({ label: figure.label, value: figure.value })), { wide: true })]),
        receiptButton(reportUrl, "Read the report"),
        receiptButton(pdfUrl, "Download the PDF"),
        receiptParagraph(signOff),
      ],
    }),
  };
}
