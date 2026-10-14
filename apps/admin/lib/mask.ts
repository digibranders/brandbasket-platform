import { maskPhone } from "@fynix/shared/server/phone-display";

/**
 * What a staff list shows of someone's contact details: their name and a number with all but the last three digits hidden
 * (DPDP Rules 2025 r.6(1)(b): access control). The full number is on the lead's own page, whose every opening is in the
 * staff access log. A lead who gave no number (an account opened with an email address) is shown with that address, the only way to reach them.
 */
export function leadContactLine(name: string, phone: string | null, email: string): string {
  return `${name} · ${phone === null ? email : maskPhone(phone)}`;
}
