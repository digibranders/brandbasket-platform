/** What the Website tab says after a staff action on the Google card. */
export type GoogleNotice = "retry-asked" | "retry-nothing" | "detached" | "detach-confirm" | "detach-nothing" | "provisioned" | "provision-nothing";

/** Fixed messages only: the query parameter picks one, and nothing from it is ever shown. */
export const GOOGLE_NOTICES: Readonly<Record<GoogleNotice, { readonly text: string; readonly ok: boolean }>> = {
  "retry-asked": { text: "Asked. The go-live job checks again within 15 minutes.", ok: true },
  "retry-nothing": { text: "Nothing changed: this site is already verified, detached or not added.", ok: false },
  detached: { text: "Detached. The go-live job leaves this site alone, and the history is kept.", ok: true },
  "detach-confirm": { text: "Nothing changed: tick the box to confirm you want to detach this client from Google.", ok: false },
  "detach-nothing": { text: "Nothing changed: there was nothing attached to detach.", ok: false },
  provisioned: { text: "Put back in the queue. The go-live job picks the site up within 15 minutes.", ok: true },
  "provision-nothing": { text: "Nothing changed: this client is not detached.", ok: false },
};

export function googleNoticeHref(businessId: string, notice: GoogleNotice): string {
  return `/clients/${businessId}/website?google=${notice}#google`;
}

export function readGoogleNotice(value: string | string[] | undefined): GoogleNotice | null {
  return typeof value === "string" && Object.hasOwn(GOOGLE_NOTICES, value) ? (value as GoogleNotice) : null;
}
