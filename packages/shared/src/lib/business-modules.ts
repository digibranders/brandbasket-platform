import { isBusinessType, type BusinessType } from "./business-types";

/** The optional features a business can have switched on. Stored as the `business_module` enum's values. */
export const BUSINESS_MODULES = ["appointments"] as const;
export type BusinessModule = (typeof BUSINESS_MODULES)[number];

export const BUSINESS_MODULE_LABELS: Readonly<Record<BusinessModule, string>> = { appointments: "Appointments" };

export function isBusinessModule(value: string): value is BusinessModule {
  return (BUSINESS_MODULES as readonly string[]).includes(value);
}

/** Trades that usually take bookings. Only a hint for staff on the lead page: nothing is switched on from it. */
const SUGGESTIONS: Partial<Readonly<Record<BusinessType, readonly BusinessModule[]>>> = {
  clinic: ["appointments"],
  salon: ["appointments"],
  fitness: ["appointments"],
};

export function suggestedModules(businessType: string | null): readonly BusinessModule[] {
  if (businessType === null) return [];
  if (!isBusinessType(businessType)) return [];
  return SUGGESTIONS[businessType] ?? [];
}
