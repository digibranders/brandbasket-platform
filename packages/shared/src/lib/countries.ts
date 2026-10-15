/**
 * The countries an owner can say they are in at sign-up: ISO 3166-1 alpha-2 codes, in the order of their English names.
 * Pure and browser-safe (the names come from the runtime's Intl, so the list itself is plain data). India is the one
 * country whose state is asked, for GST (docs/superpowers/specs/2026-10-09-gst-tax-invoices-design.md).
 */

export const HOME_COUNTRY = "IN";

export const COUNTRY_CODES: readonly string[] = [
  "AF", "AX", "AL", "DZ", "AS", "AD", "AO", "AI", "AG", "AR", "AM", "AW",
  "AU", "AT", "AZ", "BS", "BH", "BD", "BB", "BY", "BE", "BZ", "BJ", "BM",
  "BT", "BO", "BA", "BW", "BR", "IO", "VG", "BN", "BG", "BF", "BI", "KH",
  "CM", "CA", "CV", "BQ", "KY", "CF", "TD", "CL", "CN", "CX", "CC", "CO",
  "KM", "CG", "CD", "CK", "CR", "CI", "HR", "CU", "CW", "CY", "CZ", "DK",
  "DJ", "DM", "DO", "EC", "EG", "SV", "GQ", "ER", "EE", "SZ", "ET", "FK",
  "FO", "FJ", "FI", "FR", "GF", "PF", "GA", "GM", "GE", "DE", "GH", "GI",
  "GR", "GL", "GD", "GP", "GU", "GT", "GG", "GN", "GW", "GY", "HT", "HN",
  "HK", "HU", "IS", "IN", "ID", "IR", "IQ", "IE", "IM", "IL", "IT", "JM",
  "JP", "JE", "JO", "KZ", "KE", "KI", "KW", "KG", "LA", "LV", "LB", "LS",
  "LR", "LY", "LI", "LT", "LU", "MO", "MG", "MW", "MY", "MV", "ML", "MT",
  "MH", "MQ", "MR", "MU", "YT", "MX", "FM", "MD", "MC", "MN", "ME", "MS",
  "MA", "MZ", "MM", "NA", "NR", "NP", "NL", "NC", "NZ", "NI", "NE", "NG",
  "NU", "NF", "KP", "MK", "MP", "NO", "OM", "PK", "PW", "PS", "PA", "PG",
  "PY", "PE", "PH", "PL", "PT", "PR", "QA", "RE", "RO", "RU", "RW", "WS",
  "SM", "ST", "SA", "SN", "RS", "SC", "SL", "SG", "SX", "SK", "SI", "SB",
  "SO", "ZA", "KR", "SS", "ES", "LK", "BL", "SH", "KN", "LC", "MF", "PM",
  "VC", "SD", "SR", "SJ", "SE", "CH", "SY", "TW", "TJ", "TZ", "TH", "TL",
  "TG", "TK", "TO", "TT", "TN", "TR", "TM", "TC", "TV", "VI", "UG", "UA",
  "AE", "GB", "US", "UY", "UZ", "VU", "VA", "VE", "VN", "WF", "EH", "YE",
  "ZM", "ZW",
];

const CODE_SET: ReadonlySet<string> = new Set(COUNTRY_CODES);

export function isCountryCode(value: string): boolean {
  return CODE_SET.has(value);
}

export interface CountryOption {
  readonly code: string;
  readonly name: string;
}

/** Every country with its English name, for a select. Built on the server and passed to the form. */
export function countryOptions(): readonly CountryOption[] {
  const names = new Intl.DisplayNames(["en"], { type: "region" });
  return COUNTRY_CODES.map((code) => ({ code, name: names.of(code) ?? code }));
}
