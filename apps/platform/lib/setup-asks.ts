import type { ServiceKey } from "@/lib/first-look";
import { isBlockingSetup, type SetupKey } from "@/lib/service-setup";
import type { TodoItem } from "@/lib/todo";

/** One thing we still need from the customer for a service, with what they already told us, for the form's starting values. */
export interface SetupAsk {
  readonly key: string;
  readonly setup: SetupKey;
  readonly label: string;
  readonly hint: string;
  readonly saved: Readonly<Record<string, unknown>> | undefined;
}

interface SavedAnswers {
  readonly social: Readonly<Record<string, unknown>> | undefined;
  readonly search: Readonly<Record<string, unknown>> | undefined;
}

/** The open questions a service blocks on, in the order the checklist lists them. A question already answered, or not about delivery, is left out. */
export function setupAsks(items: readonly TodoItem[], answers: SavedAnswers, service: "social" | "search"): readonly SetupAsk[] {
  return items.flatMap((item): SetupAsk[] =>
    item.kind === "form" && item.service === service && !item.done && isBlockingSetup(item.setup)
      ? [{ key: item.key, setup: item.setup, label: item.label, hint: item.hint, saved: answers[service] }]
      : [],
  );
}

/** The id the card carries, so Home can open the service page scrolled to it. */
export const SETUP_CARD_ID = "setup";

/** Where a service's open questions are asked: the card at the top of its own page. */
export function setupPageHref(service: ServiceKey): string {
  return `/${service === "search" ? "search" : "social"}#${SETUP_CARD_ID}`;
}
