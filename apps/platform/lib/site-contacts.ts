/** Calls, WhatsApp taps and forms from the customer's website, as counted by the website itself. */
export interface SiteContacts {
  readonly call: number;
  readonly whatsapp: number;
  readonly form: number;
}

export const SITE_CONTACT_WINDOW_DAYS = 30;
/** How far back a website must have reported a contact for its counts to be believed. */
export const SITE_CONTACT_MEASURED_DAYS = 90;

const total = (counts: SiteContacts): number => counts.call + counts.whatsapp + counts.form;

/**
 * The contacts to show: the last 30 days' counts, or null while the website has reported nothing in the last 90 days. A website
 * that is not reporting contacts would otherwise show three zeros that nobody measured; once it reports any, a quiet month is a
 * real zero and is shown as one.
 */
export function measuredContacts(recent: SiteContacts, longer: SiteContacts): SiteContacts | null {
  return total(longer) === 0 && total(recent) === 0 ? null : recent;
}
