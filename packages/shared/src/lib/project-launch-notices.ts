/** What the client page says after an admin marks a project live. */
export type ProjectLaunchNotice = "launched" | "launched-no-email" | "not-approved" | "no-owner" | "no-domain";

/** Fixed messages only: the query parameter picks one, and nothing from it is ever shown. */
export const PROJECT_LAUNCH_NOTICES: Readonly<Record<ProjectLaunchNotice, { readonly text: string; readonly ok: boolean }>> = {
  launched: { text: "Live. The client has been emailed their website address.", ok: true },
  "launched-no-email": {
    text: "Live. This owner signs in with a mobile number and has no email, so nothing was emailed: call or message them with their website address.",
    ok: true,
  },
  "not-approved": { text: "Nothing changed: this business hasn’t approved a preview yet.", ok: false },
  "no-owner": { text: "Nothing changed: this business has no owner account to email.", ok: false },
  "no-domain": { text: "Nothing changed: this business has no domain to launch it on.", ok: false },
};

export function projectLaunchNoticeHref(businessId: string, notice: ProjectLaunchNotice): string {
  return `/clients/${businessId}?launch=${notice}`;
}

export function readProjectLaunchNotice(value: string | string[] | undefined): ProjectLaunchNotice | null {
  return typeof value === "string" && Object.hasOwn(PROJECT_LAUNCH_NOTICES, value)
    ? (value as ProjectLaunchNotice)
    : null;
}
