// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { reactivationSummary } from "@/lib/billing/payment-summaries";
import type { ReactivateFormState } from "@/lib/billing/reactivate-form";
import { ReactivatePlan } from "./reactivate-plan";

const SUMMARY = reactivationSummary({
  services: [{ key: "managed-website", title: "Website Management", netCents: 299_900 }],
  discountCents: 0,
  total: "₹2,999",
  currency: "INR",
  interval: "month",
  renewsOn: "Sun 13 Dec",
});

const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLElement;
let root: Root;

beforeEach(() => {
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (name: string): HTMLButtonElement => {
  const found = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent === name);
  if (found === undefined) throw new Error(`No button "${name}"`);
  return found;
};
const show = (action: (state: ReactivateFormState, formData: FormData) => Promise<ReactivateFormState>): Promise<void> =>
  act(async () =>
    root.render(<ReactivatePlan planName="Brandbasket services plan" monthlyAmount="₹2,999" priceNote="₹2,999 a month, GST included." summary={SUMMARY} action={action} services={["managed-website"]} />),
  );

describe("Reactivate", () => {
  it("shows the services, the total and the renewal before anything is sent", async () => {
    const action = vi.fn(async (): Promise<ReactivateFormState> => ({ status: "idle" }));
    await show(action);
    await act(async () => button("Reactivate for ₹2,999").click());
    const dialog = container.querySelector("dialog");
    expect(dialog?.open).toBe(true);
    for (const text of ["Reactivate your plan", "Website Management", "Due today", "₹2,999", "It renews a month from Sun 13 Dec.", "All prices include GST."]) {
      expect(dialog?.textContent).toContain(text);
    }
    expect(action).not.toHaveBeenCalled();
  });

  it("posts the chosen services from the dialog, and closes on a refusal so its message shows on the page", async () => {
    const action = vi.fn(async (): Promise<ReactivateFormState> => ({ status: "error", message: "Choose a service first." }));
    await show(action);
    await act(async () => button("Reactivate for ₹2,999").click());
    await act(async () => button("Pay ₹2,999").click());
    expect(action).toHaveBeenCalledTimes(1);
    const sent = (action.mock.calls[0] as unknown as [ReactivateFormState, FormData])[1];
    expect(sent.getAll("service")).toEqual(["managed-website"]);
    expect(container.querySelector("dialog")?.open).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Choose a service first.");
  });
});
