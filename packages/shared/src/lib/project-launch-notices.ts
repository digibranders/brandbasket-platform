/** What the client page says after an admin marks a project live, saves its launch checks, or resends the launch email. */
export type ProjectLaunchNotice =
  | "launched"
  | "launched-no-email"
  | "launched-email-failed"
  | "not-approved"
  | "no-owner"
  | "no-domain"
  | "checks-missing"
  | "checks-saved"
  | "checks-not-allowed"
  | "resent"
  | "resend-failed"
  | "resend-not-allowed"
  | "address-saved"
  | "address-unavailable"
  | "check-ok"
  | "check-failed"
  | "check-no-domain";

/** Fixed messages only: the query parameter picks one, and nothing from it is ever shown. */
export const PROJECT_LAUNCH_NOTICES: Readonly<Record<ProjectLaunchNotice, { readonly text: string; readonly ok: boolean }>> = {
  launched: { text: "Live. The client has been emailed their website address.", ok: true },
  "launched-no-email": {
    text: "Live. This owner signs in with a mobile number and has no email, so nothing was emailed: call or message them with their website address.",
    ok: true,
  },
  "launched-email-failed": {
    text: "The website is marked live, but the email to the customer did not send. Use Resend email below.",
    ok: false,
  },
  "not-approved": { text: "Nothing changed: this business hasn’t approved a preview yet.", ok: false },
  "no-owner": { text: "Nothing changed: this business has no owner account to email.", ok: false },
  "no-domain": { text: "Nothing changed: this business has no domain to launch it on.", ok: false },
  "checks-missing": { text: "Tick every launch check before going live.", ok: false },
  "checks-saved": { text: "Launch checks saved.", ok: true },
  "checks-not-allowed": {
    text: "Nothing saved: launch checks can only be ticked while the project is approved.",
    ok: false,
  },
  resent: { text: "The launch email was sent again.", ok: true },
  "resend-failed": {
    text: "The launch email still did not send. Try again in a few minutes, or call or message the customer.",
    ok: false,
  },
  "resend-not-allowed": {
    text: "Nothing sent: the launch email can only be sent again within 7 days of going live, with a domain and an owner to email.",
    ok: false,
  },
  "address-saved": { text: "Their free address is saved.", ok: true },
  "address-unavailable": {
    text: "No free address could be made. Check the site address setting or add the domain another way.",
    ok: false,
  },
  "check-ok": {
    text: "The address loads over HTTPS. This is a quick automatic check, so still look at the site yourself.",
    ok: true,
  },
  "check-failed": { text: "The address did not load properly. Check DNS and the deployment, then try again.", ok: false },
  "check-no-domain": { text: "Add an address first.", ok: false },
};

export function projectLaunchNoticeHref(businessId: string, notice: ProjectLaunchNotice): string {
  return `/clients/${businessId}?launch=${notice}`;
}

export function readProjectLaunchNotice(value: string | string[] | undefined): ProjectLaunchNotice | null {
  return typeof value === "string" && Object.hasOwn(PROJECT_LAUNCH_NOTICES, value)
    ? (value as ProjectLaunchNotice)
    : null;
}
