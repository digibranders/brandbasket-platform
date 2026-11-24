/**
 * Mail a person may opt out of. These carry List-Unsubscribe headers and are skipped for a suppressed address. Everything else
 * (sign-in codes, receipts, payment, security, invites, anything that answers something the person did) is mandatory and
 * always goes. Decided by template name so a retried row, which keeps its template, is judged the same way as the first send.
 */
const OPTIONAL_TEMPLATES: ReadonlySet<string> = new Set(["monthly-report", "preview-ready", "request-acknowledgement"]);
const OPTIONAL_TEMPLATE_PREFIXES: readonly string[] = ["change-request-"];

export function isOptionalEmail(template: string): boolean {
  return OPTIONAL_TEMPLATES.has(template) || OPTIONAL_TEMPLATE_PREFIXES.some((prefix) => template.startsWith(prefix));
}
