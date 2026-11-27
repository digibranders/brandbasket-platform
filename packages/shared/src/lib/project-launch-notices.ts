/** What the client page says after an admin marks a project live, saves its launch checks, or resends the launch email. */
export type ProjectLaunchNotice =
  | "launched"
  | "launched-no-email"
  | "launched-email-failed"
  | "launched-email-queued"
  | "not-approved"
  | "no-owner"
  | "no-domain"
  | "checks-missing"
  | "address-unverified"
  | "checks-saved"
  | "checks-not-allowed"
  | "resent"
  | "resend-failed"
  | "resend-queued"
  | "resend-not-allowed"
  | "address-saved"
  | "address-changed"
  | "address-invalid"
  | "address-taken"
  | "address-locked"
  | "address-unavailable"
  | "check-ok"
  | "check-failed"
  | "check-no-domain"
  | "unconfirmed"
  | "balance-unpaid"
  | "ready-sent"
  | "ready-no-deal"
  | "ready-not-approved"
  | "ready-not-building"
  | "ready-undone"
  | "ready-not-undone";

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
  "launched-email-queued": {
    text: "The website is marked live. The email to the customer did not go yet: it is queued and will be tried again within the hour. Check Deliveries if it does not arrive.",
    ok: false,
  },
  "not-approved": { text: "Nothing changed: this business hasn’t approved a preview yet.", ok: false },
  "no-owner": { text: "Nothing changed: this business has no owner account to email.", ok: false },
  "no-domain": { text: "Nothing changed: this business has no domain to launch it on.", ok: false },
  "checks-missing": { text: "Tick every launch check before going live.", ok: false },
  "address-unverified": {
    text: "Not marked live: the address did not load over HTTPS. Check DNS and the deployment, or tick the box beside Mark live to go live anyway.",
    ok: false,
  },
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
  "resend-queued": {
    text: "The email did not go yet: it is queued and will be tried again within the hour. Check Deliveries if it does not arrive.",
    ok: false,
  },
  "resend-not-allowed": {
    text: "Nothing sent: the launch email can only be sent again within 7 days of going live, with a domain and an owner to email.",
    ok: false,
  },
  "address-saved": { text: "Their free address is saved.", ok: true },
  "address-changed": { text: "Their free address is changed.", ok: true },
  "address-invalid": {
    text: "That name cannot be used. Use 3 to 40 letters, numbers or single hyphens, and not a name we keep for ourselves.",
    ok: false,
  },
  "address-taken": { text: "Another business already has that address. Try a different name.", ok: false },
  "address-locked": { text: "Nothing changed: the website is live on this address, or the business has no free address.", ok: false },
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
  unconfirmed: { text: "Nothing changed: confirm the action to proceed.", ok: false },
  "balance-unpaid": { text: "Not marked live: the customer's plan is not running. For a paid deal, they have not paid the balance and the first period yet.", ok: false },
  "ready-sent": { text: "Marked ready. The customer has been told to pay the balance.", ok: true },
  "ready-no-deal": { text: "Nothing changed: this business has no paid deal waiting for its website to be ready.", ok: false },
  "ready-not-approved": { text: "Nothing changed: the customer has not approved the preview yet.", ok: false },
  "ready-not-building": { text: "Nothing changed: this deal is not waiting for the website to be marked ready.", ok: false },
  "ready-undone": { text: "Ready undone. The customer is no longer asked to pay the balance.", ok: true },
  "ready-not-undone": { text: "Nothing changed: this deal is not waiting for the balance.", ok: false },
};

export function projectLaunchNoticeHref(businessId: string, notice: ProjectLaunchNotice): string {
  return `/clients/${businessId}/website?launch=${notice}`;
}

export function readProjectLaunchNotice(value: string | string[] | undefined): ProjectLaunchNotice | null {
  return typeof value === "string" && Object.hasOwn(PROJECT_LAUNCH_NOTICES, value)
    ? (value as ProjectLaunchNotice)
    : null;
}
