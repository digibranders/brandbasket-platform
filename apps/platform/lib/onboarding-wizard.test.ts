// @vitest-environment happy-dom
import { act, createElement, type ReactElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { OnboardingStepList } from "@/components/panel/onboarding-step-list";
import { StepFooter, StepFormError, StepTextField, useStepForm, type StepAction } from "@/components/panel/step-form";
import type { OnboardingStepKey } from "@brandbasket/shared/lib/onboarding/steps";
import type { StepFormState } from "@/lib/onboarding/form-state";

vi.mock("next/link", () => ({
  default: ({ href, children, ...rest }: { href: string; children: unknown } & Record<string, unknown>) => createElement("a", { href, ...rest }, children as never),
}));

let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(async () => {
  await act(async () => root.unmount());
  container.remove();
});

async function render(element: ReactElement): Promise<void> {
  await act(async () => root.render(element));
}

describe("the setup stepper", () => {
  it("links every step, marks the current one and says which are done", async () => {
    await render(createElement(OnboardingStepList, { current: "content", completed: ["business"] }));
    const links = [...container.querySelectorAll("a")];
    expect(links.map((link) => link.getAttribute("href"))).toEqual([
      "/onboarding/business",
      "/onboarding/content",
      "/onboarding/brand",
      "/onboarding/domain",
      "/onboarding/review",
    ]);
    expect(links.map((link) => link.getAttribute("aria-current"))).toEqual([null, "step", null, null, null]);
    expect(links[0]?.textContent).toContain("(done)");
    expect(links[2]?.textContent).toContain("(to do)");
  });
});

function Step({ step, action }: { readonly step: OnboardingStepKey; readonly action: StepAction }): ReactElement {
  const { formRef, errorRef, formAction, controls } = useStepForm(action, { inline: true });
  return createElement(
    "form",
    { ref: formRef, action: formAction, className: "group/step" },
    createElement(StepTextField, { controls, name: "email", label: "Public email", saved: null, maxLength: 254, optional: true }),
    createElement(StepFormError, { controls, errorRef }),
    createElement(StepFooter, { controls, step, label: "Save and continue", pendingLabel: "Saving…" }),
  );
}

describe("a step's footer and errors", () => {
  const refuse: StepAction = vi.fn(
    async (): Promise<StepFormState> => ({ status: "error", message: "Enter a valid email address.", field: "email", values: { email: "x@y" } }),
  );

  it("goes back to the step before, and has no Back on the first step", async () => {
    await render(createElement(Step, { step: "domain", action: refuse }));
    expect(container.querySelector("a")?.getAttribute("href")).toBe("/onboarding/brand");
    await render(createElement(Step, { step: "business", action: refuse }));
    expect(container.querySelector("a")).toBeNull();
  });

  it("draws a refused field's message under the field and keeps the form-level one out of the way", async () => {
    await render(createElement(Step, { step: "business", action: refuse }));
    const form = container.querySelector("form") as HTMLFormElement;
    await act(async () => form.requestSubmit());
    const inline = container.querySelector("[data-inline-error]");
    expect(inline?.textContent).toBe("Enter a valid email address.");
    expect(inline?.closest("div")?.querySelector("input")?.getAttribute("aria-invalid")).toBe("true");
    const banner = container.querySelector("form > [role=alert]:not([data-inline-error])");
    expect(banner?.className).toContain("group-has-[[data-inline-error]]/step:hidden");
  });
});
