/** The onboarding steps a checklist item can send the customer back to. */
export type ChecklistStep = "business" | "content" | "brand" | "domain";

export interface ChecklistInput {
  readonly displayName: string | null;
  readonly phone: string | null;
  readonly email: string | null;
  readonly serviceCount: number;
  readonly logoCount: number;
  readonly photoCount: number;
  /** Photos still missing the description people who can't see them rely on. */
  readonly undescribedPhotoCount: number;
  readonly domain: { readonly hostname: string; readonly ownerConfirmed: boolean } | null;
}

export interface ChecklistItem {
  readonly key: string;
  readonly label: string;
  readonly step: ChecklistStep;
  readonly passed: boolean;
}

/**
 * What must be true before onboarding can be sent. Runs on the server when the customer submits, whatever the
 * page showed them, and the domain rule is the customer's own decision: no domain, no build.
 */
export function onboardingChecklist(input: ChecklistInput): readonly ChecklistItem[] {
  const items: readonly ChecklistItem[] = [
    {
      key: "business-name",
      label: "Your business name",
      step: "business",
      passed: (input.displayName ?? "").trim() !== "",
    },
    {
      key: "contact",
      label: "A phone number or email your customers can use",
      step: "business",
      passed: input.phone !== null || input.email !== null,
    },
    {
      key: "services",
      label: "At least one service",
      step: "content",
      passed: input.serviceCount > 0,
    },
    {
      key: "images",
      label: "Your logo or at least one photo",
      step: "brand",
      passed: input.logoCount > 0 || input.photoCount > 0,
    },
    {
      key: "photo-descriptions",
      label: "A description for every photo",
      step: "brand",
      passed: input.undescribedPhotoCount === 0,
    },
    {
      key: "domain",
      label: "Your domain, confirmed as yours",
      step: "domain",
      passed: input.domain !== null && input.domain.ownerConfirmed,
    },
  ];
  // With no photos there is nothing to describe, so the line would only be a tick for nothing.
  return input.photoCount === 0 ? items.filter((item) => item.key !== "photo-descriptions") : items;
}

/** The first thing still missing, or null when onboarding can be sent. */
export function firstMissing(items: readonly ChecklistItem[]): ChecklistItem | null {
  return items.find((item) => !item.passed) ?? null;
}
