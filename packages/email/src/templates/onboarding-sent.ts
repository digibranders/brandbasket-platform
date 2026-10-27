import { assertWebUrl, sanitizeHeaderValue, type EmailMessage } from "../message";
import { receiptButton, receiptDocument, receiptParagraph } from "../receipt";

export interface OnboardingSentInput {
  readonly to: string;
  readonly businessName: string;
  readonly clientUrl: string;
  /** How long the team has to send the first preview, from the moment the customer sent their details. */
  readonly previewDueHours: number;
}

/** Internal notification: a customer sent their website details, so the build can start and the first-preview clock is running. */
export function onboardingSentEmail(input: OnboardingSentInput): EmailMessage {
  const clientUrl = assertWebUrl(input.clientUrl, "clientUrl");
  const lines = [
    `${input.businessName} has sent their website details.`,
    `The first preview is due within ${input.previewDueHours} hours.`,
    `Open the client: ${clientUrl}`,
  ];

  return {
    to: sanitizeHeaderValue(input.to),
    subject: sanitizeHeaderValue(`${input.businessName} sent their website details`),
    template: "onboarding-sent",
    bodyText: lines.join("\n"),
    bodyHtml: receiptDocument({
      title: `${input.businessName} sent their website details`,
      kicker: "Website details sent",
      heading: `${input.businessName} sent their website details`,
      body: [receiptParagraph(lines[0] ?? ""), receiptParagraph(lines[1] ?? ""), receiptButton(clientUrl, "Open the client")],
    }),
  };
}
