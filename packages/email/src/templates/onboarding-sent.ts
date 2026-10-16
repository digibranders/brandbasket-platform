import { assertWebUrl, escapeHtml, htmlDocument, sanitizeHeaderValue, type EmailMessage } from "../message";

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
    bodyHtml: htmlDocument(`${input.businessName} sent their website details`, [
      escapeHtml(lines[0] ?? ""),
      escapeHtml(lines[1] ?? ""),
      `<a href="${escapeHtml(clientUrl)}">Open the client</a> (${escapeHtml(clientUrl)})`,
    ]),
  };
}
