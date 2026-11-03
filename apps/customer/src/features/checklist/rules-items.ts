import { firstMissing, onboardingChecklist, type ChecklistItem } from "@brandbasket/shared/lib/onboarding/checklist";
import type { OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";
import type { Service } from "@/lib/guard-rules";
import { checklistInputFrom, type OnboardingSnapshot } from "./rules-snapshot";
import { doneSetupKeys, type SetupKey } from "./setup-rules";

/** The things we ask for, in the order the page lists them. "offers" is not asked: it comes up on the kickoff call. */
export const CHECKLIST_KEYS = ["business", "brand", "services", "domain", "accounts", "budget", "areas"] as const;
export type ChecklistKey = (typeof CHECKLIST_KEYS)[number];

/** The Social and Search answers the checklist asks for. */
export type AskedSetupKey = Exclude<SetupKey, "offers">;

export type AnswerStep = Exclude<OnboardingStepKey, "review">;

export interface ItemDefinition {
  readonly key: ChecklistKey;
  readonly label: string;
  readonly service: Service;
  /** The website step that collects it; null for Social and Search items. */
  readonly step: AnswerStep | null;
  /** The Social or Search answer that collects it; null for website items. */
  readonly setup: AskedSetupKey | null;
}

/** Words and order ported from apps/platform lib/ready-items.ts; "Your business" is the old step's title. */
const DEFINITIONS: Readonly<Record<ChecklistKey, ItemDefinition>> = {
  business: { key: "business", label: "Your business", service: "website", step: "business", setup: null },
  brand: { key: "brand", label: "Logo and photos", service: "website", step: "brand", setup: null },
  services: { key: "services", label: "Services and prices", service: "website", step: "content", setup: null },
  domain: { key: "domain", label: "Your web address", service: "website", step: "domain", setup: null },
  accounts: { key: "accounts", label: "Instagram and Facebook pages", service: "social", step: null, setup: "accounts" },
  budget: { key: "budget", label: "Monthly ad budget", service: "social", step: null, setup: "budget" },
  areas: { key: "areas", label: "Areas you serve and main competitors", service: "search", step: null, setup: "areas" },
};

export function isChecklistKey(value: string | null | undefined): value is ChecklistKey {
  return value !== null && value !== undefined && (CHECKLIST_KEYS as readonly string[]).includes(value);
}

export function definitionOf(key: ChecklistKey): ItemDefinition {
  return DEFINITIONS[key];
}

/** The items for the services on the plan, in list order. */
export function itemsFor(services: readonly Service[]): readonly ItemDefinition[] {
  return CHECKLIST_KEYS.map((key) => DEFINITIONS[key]).filter((item) => services.includes(item.service));
}

/** Saved Social and Search answers, as listServiceSetups returns them. */
export interface SavedAnswers {
  readonly social: Readonly<Record<string, unknown>> | undefined;
  readonly search: Readonly<Record<string, unknown>> | undefined;
}

export interface ChecklistRow {
  readonly item: ItemDefinition;
  readonly done: boolean;
}

/** The send checklist's lines that belong to one website step. */
function stepLines(step: AnswerStep, lines: readonly ChecklistItem[]): readonly ChecklistItem[] {
  return lines.filter((line) => line.step === step);
}

/**
 * Whether a website item is done: its step was saved, and what is stored still passes the checks the team relies on (a logo
 * removed after saving, say, reopens the item). Once the project has left onboarding every website item reads as done.
 */
export function websiteItemDone(step: AnswerStep, snapshot: OnboardingSnapshot): boolean {
  if (snapshot.locked) return true;
  if (!snapshot.completed.includes(step)) return false;
  return firstMissing(stepLines(step, onboardingChecklist(checklistInputFrom(snapshot)))) === null;
}

/**
 * The items with whether each is done, open ones first. The sort is stable, so each group keeps the list's order.
 * `snapshot` is null when the plan has no website (nothing was read for it).
 */
export function checklistRows(services: readonly Service[], snapshot: OnboardingSnapshot | null, answers: SavedAnswers): readonly ChecklistRow[] {
  const doneSetup = doneSetupKeys(answers);
  return itemsFor(services)
    .map((item): ChecklistRow => {
      if (item.step !== null) return { item, done: snapshot !== null && websiteItemDone(item.step, snapshot) };
      return { item, done: item.setup !== null && doneSetup.includes(item.setup) };
    })
    .sort((a, b) => Number(a.done) - Number(b.done));
}

/** Shown on an item a viewer opens: they may look, not change. */
export const VIEWER_MESSAGE = "Only the owner or an editor can change this.";
