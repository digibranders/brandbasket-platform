/** What the client page says after staff press "Ready for customer's DNS". */
export type DomainConnectNotice =
  | "ready"
  | "ready-no-email"
  | "already"
  | "not-ready"
  | "no-owner"
  | "free-address"
  | "switched"
  | "switched-no-email"
  | "switch-not-ready";

/** Fixed messages only: the query parameter picks one, and nothing from it is ever shown. */
export const DOMAIN_CONNECT_NOTICES: Readonly<Record<DomainConnectNotice, { readonly text: string; readonly ok: boolean }>> = {
  ready: { text: "Done. The client has been emailed to connect their domain, and the steps now show on their dashboard.", ok: true },
  "ready-no-email": {
    text: "Done, and the steps now show on their dashboard. This owner signs in with a mobile number and has no email, so nothing was emailed: call or message them to connect their domain.",
    ok: true,
  },
  already: { text: "Nothing changed: they have already been asked to connect their domain.", ok: true },
  "not-ready": { text: "Nothing changed: this business needs an approved preview and a domain of its own first.", ok: false },
  "no-owner": { text: "Nothing changed: this business has no owner account to email.", ok: false },
  switched: { text: "Switched. Their website now lives on their own domain, and the client has been emailed.", ok: true },
  "switched-no-email": {
    text: "Switched. This owner signs in with a mobile number and has no email, so nothing was emailed: call or message them with their new address.",
    ok: true,
  },
  "switch-not-ready": { text: "Nothing changed: their DNS hasn’t been found connected yet, so there’s nothing to switch to.", ok: false },
  "free-address": { text: "Nothing changed: they are on our free address, so there is no DNS for them to change.", ok: false },
};

export function domainConnectNoticeHref(businessId: string, notice: DomainConnectNotice): string {
  return `/clients/${businessId}?dns=${notice}#domain`;
}

export function readDomainConnectNotice(value: string | string[] | undefined): DomainConnectNotice | null {
  return typeof value === "string" && Object.hasOwn(DOMAIN_CONNECT_NOTICES, value) ? (value as DomainConnectNotice) : null;
}
