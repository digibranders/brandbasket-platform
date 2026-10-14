/** What the client page says after an admin changes a business's time zone or a module's on/off state. */
export type BusinessModuleNotice =
  | "zone-saved"
  | "zone-cleared"
  | "zone-in-use"
  | "bad-zone"
  | "needs-zone"
  | "module-on"
  | "module-off"
  | "module-premium-only"
  | "confirm-off";

/** Fixed messages only: the query parameter picks one, and nothing from it is ever shown. */
export const BUSINESS_MODULE_NOTICES: Readonly<Record<BusinessModuleNotice, { readonly text: string; readonly ok: boolean }>> = {
  "zone-saved": { text: "Time zone saved.", ok: true },
  "zone-cleared": { text: "Time zone cleared.", ok: true },
  "zone-in-use": { text: "Switch appointments off before clearing the time zone.", ok: false },
  "bad-zone": { text: "That isn’t a time zone we recognise.", ok: false },
  "needs-zone": { text: "Set a time zone before switching appointments on.", ok: false },
  "module-on": { text: "Appointments are on. Their dashboard shows the Appointments tab.", ok: true },
  "module-off": {
    text: "Appointments are off. Their booking form stops taking requests; nothing was deleted.",
    ok: true,
  },
  "module-premium-only": { text: "Appointments are part of Premium, and this client is on Care.", ok: false },
  "confirm-off": { text: "Tick the box to confirm switching appointments off.", ok: false },
};

/** `#features` scrolls the reader straight to the Features section, since the notice renders inside it. */
export function businessModuleNoticeHref(businessId: string, notice: BusinessModuleNotice): string {
  return `/clients/${businessId}?features=${notice}#features`;
}

export function readBusinessModuleNotice(value: string | string[] | undefined): BusinessModuleNotice | null {
  return typeof value === "string" && Object.hasOwn(BUSINESS_MODULE_NOTICES, value)
    ? (value as BusinessModuleNotice)
    : null;
}
