import { onboardingStepHref, type OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";
import type { ServiceKey } from "@/lib/first-look";
import { readyRows } from "@/lib/ready-items";
import type { SetupKey } from "@/lib/service-setup";

interface TodoBase {
  readonly key: string;
  readonly label: string;
  readonly hint: string;
  readonly service: ServiceKey;
  readonly done: boolean;
}

/** A website item opens its setup page; a Social or Search item opens its own small form on the To do page. */
export type TodoItem =
  | (TodoBase & { readonly kind: "link"; readonly href: string })
  | (TodoBase & { readonly kind: "form"; readonly setup: SetupKey });

/** Everything the customer still owes us (open first) and what they have done, for the services they bought. */
export function buildTodo(services: readonly ServiceKey[], doneSteps: readonly OnboardingStepKey[], doneSetup: readonly SetupKey[]): readonly TodoItem[] {
  return readyRows(services, doneSteps, doneSetup).flatMap(({ item, done }): TodoItem[] => {
    const base = { key: item.key, label: item.label, hint: item.hint, service: item.service, done };
    if (item.step !== null) return [{ ...base, kind: "link", href: onboardingStepHref(item.step) }];
    if (item.setup !== null) return [{ ...base, kind: "form", setup: item.setup }];
    return [];
  });
}

/** How many items are still open: the number on the rail and on Overview. */
export function openCount(items: readonly TodoItem[]): number {
  return items.filter((item) => !item.done).length;
}
