import type { OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";
import type { ServiceKey } from "@/lib/first-look";

/** One thing to have ready for the kickoff call. */
export interface ReadyItem {
  readonly key: string;
  readonly service: ServiceKey;
  readonly label: string;
  readonly hint: string;
  /** The website setup step that collects it; null when it is collected on the call (Social and Search, until plan 30). */
  readonly step: OnboardingStepKey | null;
}

/** The list, in the order the screens show it (mock: docs/design/platform-ledger.html, screen 1). */
export const READY_ITEMS: readonly ReadyItem[] = [
  { key: "brand", service: "website", label: "Logo and photos", hint: "Your logo and 5 to 10 photos of your place, team and work", step: "brand" },
  { key: "services", service: "website", label: "Services and prices", hint: "What you want on the site", step: "content" },
  { key: "domain", service: "website", label: "Your web address", hint: "Your domain login if you own one, or a free address to start", step: "domain" },
  { key: "accounts", service: "social", label: "Instagram and Facebook login", hint: "So we can post for you", step: null },
  { key: "offers", service: "social", label: "Offers you want to promote", hint: "Anything for this month", step: null },
  { key: "budget", service: "social", label: "Monthly ad budget", hint: "And how far from you to show ads", step: null },
  { key: "areas", service: "search", label: "Areas you serve and main competitors", hint: "Where you want to be found", step: null },
];

export function readyItemsFor(services: readonly ServiceKey[]): readonly ReadyItem[] {
  return READY_ITEMS.filter((item) => services.includes(item.service));
}

export interface ReadyRow {
  readonly item: ReadyItem;
  readonly done: boolean;
}

/** The items with whether each is done, open ones first (the sort is stable, so each group keeps the list's order). */
export function readyRows(services: readonly ServiceKey[], doneSteps: readonly OnboardingStepKey[]): readonly ReadyRow[] {
  return readyItemsFor(services)
    .map((item) => ({ item, done: item.step !== null && doneSteps.includes(item.step) }))
    .sort((a, b) => Number(a.done) - Number(b.done));
}
