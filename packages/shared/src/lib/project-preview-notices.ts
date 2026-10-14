/** What the client page says after an admin sends a preview link. */
export type ProjectPreviewNotice = "sent" | "sent-no-email" | "invalid-url" | "not-ready" | "no-owner";

/** Fixed messages only: the query parameter picks one, and nothing from it is ever shown. */
export const PROJECT_PREVIEW_NOTICES: Readonly<Record<ProjectPreviewNotice, { readonly text: string; readonly ok: boolean }>> = {
  sent: { text: "Preview sent. The client has been emailed the link, and it now shows on their dashboard.", ok: true },
  "sent-no-email": {
    text: "Preview saved, and it now shows on their dashboard. This owner signs in with a mobile number and has no email, so nothing was emailed: call or message them.",
    ok: true,
  },
  "invalid-url": { text: "Nothing sent: enter a valid http or https link.", ok: false },
  "not-ready": {
    text: "Nothing sent: this business hasn’t sent us their setup yet, or its build has already gone live.",
    ok: false,
  },
  "no-owner": { text: "Nothing sent: this business has no owner account to email.", ok: false },
};

export function projectPreviewNoticeHref(businessId: string, notice: ProjectPreviewNotice): string {
  return `/clients/${businessId}?preview=${notice}`;
}

export function readProjectPreviewNotice(value: string | string[] | undefined): ProjectPreviewNotice | null {
  return typeof value === "string" && Object.hasOwn(PROJECT_PREVIEW_NOTICES, value)
    ? (value as ProjectPreviewNotice)
    : null;
}
