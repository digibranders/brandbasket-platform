import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph, receiptQuote, receiptRows } from "../receipt";
import { emailBrandName } from "../brand";

export interface ListingEnquiryInput {
  readonly to: string;
  readonly businessName: string;
  /** The visitor's name, number and message, as they typed them on the business's page. */
  readonly visitorName: string;
  readonly visitorPhone: string;
  readonly message: string | null;
  /** Where the owner reads every enquiry, on their dashboard. */
  readonly dashboardUrl: string;
}

/** Tells a business's owner that a visitor sent an enquiry from its page on the directory, with how to reach them. */
export function listingEnquiryEmail(input: ListingEnquiryInput): EmailMessage {
  const dashboardUrl = assertWebUrl(input.dashboardUrl, "dashboardUrl");
  const title = `New enquiry for ${input.businessName}`;
  const lines = [
    `${input.visitorName} sent an enquiry to ${input.businessName} on ${emailBrandName()}.`,
    `Phone: ${input.visitorPhone}`,
    input.message === null ? "They left no message." : `Message: ${input.message}`,
  ];
  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(title),
    template: "listing-enquiry",
    bodyText: [...lines, `See all your enquiries: ${dashboardUrl}`].join("\n"),
    bodyHtml: receiptDocument({
      title,
      kicker: "New enquiry",
      heading: title,
      body: [
        receiptParagraph(lines[0] ?? ""),
        receiptRows([{ label: "Phone", value: input.visitorPhone }]),
        input.message === null ? receiptParagraph("They left no message.") : receiptQuote(input.message),
        receiptButton(dashboardUrl, "See all your enquiries"),
      ],
    }),
  };
}
