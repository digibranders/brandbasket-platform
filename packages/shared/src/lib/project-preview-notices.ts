/** What the client page says after an admin sends or resends a preview link. */
export type ProjectPreviewNotice =
  | "sent"
  | "sent-no-email"
  | "sent-email-failed"
  | "invalid-url"
  | "not-ready"
  | "no-owner"
  | "resent"
  | "resend-failed"
  | "resend-not-allowed";

/** Fixed messages only: the query parameter picks one, and nothing from it is ever shown. */
export const PROJECT_PREVIEW_NOTICES: Readonly<Record<ProjectPreviewNotice, { readonly text: string; readonly ok: boolean }>> = {
  sent: { text: "Preview sent. The client has been emailed the link, and it now shows on their dashboard.", ok: true },
  "sent-no-email": {
    text: "Preview saved, and it now shows on their dashboard. This owner signs in with a mobile number and has no email, so nothing was emailed: call or message them.",
    ok: true,
  },
  "sent-email-failed": {
    text: "The preview is saved and the customer can see it on their dashboard, but the email did not send. Use Resend email below.",
    ok: false,
  },
  "invalid-url": { text: "Nothing sent: enter a valid http or https link.", ok: false },
  "not-ready": {
    text: "Nothing sent: this business hasn’t sent us their setup yet, or its build has already gone live.",
    ok: false,
  },
  "no-owner": { text: "Nothing sent: this business has no owner account to email.", ok: false },
  resent: { text: "The preview email was sent again.", ok: true },
  "resend-failed": {
    text: "The email still did not send. Try again in a few minutes, or call or message the customer.",
    ok: false,
  },
  "resend-not-allowed": {
    text: "Nothing sent: the preview email can only be sent again while the preview is waiting for the customer, with an owner to email.",
    ok: false,
  },
};

export function projectPreviewNoticeHref(businessId: string, notice: ProjectPreviewNotice): string {
  return `/clients/${businessId}?preview=${notice}`;
}

export function readProjectPreviewNotice(value: string | string[] | undefined): ProjectPreviewNotice | null {
  return typeof value === "string" && Object.hasOwn(PROJECT_PREVIEW_NOTICES, value)
    ? (value as ProjectPreviewNotice)
    : null;
}
