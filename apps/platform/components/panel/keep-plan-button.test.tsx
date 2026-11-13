// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { keepPlanSummary } from "@/lib/billing/payment-summaries";
import { KeepPlanButton } from "./keep-plan-button";

const { keepPlan } = vi.hoisted(() => ({ keepPlan: vi.fn<() => Promise<void>>() }));
vi.mock("@/app/app-host/restore-account/actions", () => ({ keepPlan }));

const SUMMARY = keepPlanSummary({
  services: [{ key: "managed-website", title: "Website Management", netCents: 299_900 }],
  discountCents: 0,
  total: "₹2,999",
  currency: "INR",
  interval: "month",
  firstPaymentOn: "Thu 19 Nov",
});

const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLElement;
let root: Root;

beforeEach(() => {
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  keepPlan.mockReset().mockResolvedValue(undefined);
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

describe("Keep my plan", () => {
  it("says what is taken today and when the first payment falls, before anything is opened", async () => {
    await act(async () => root.render(<KeepPlanButton summary={SUMMARY} />));
    await act(async () => button("Keep my plan").click());
    const dialog = container.querySelector("dialog");
    expect(dialog?.open).toBe(true);
    for (const text of ["Keep your plan", "Website Management", "First payment on Thu 19 Nov", "₹2,999", "Nothing is taken today.", "Then it renews a month."]) {
      expect(dialog?.textContent).toContain(text);
    }
    expect(keepPlan).not.toHaveBeenCalled();
  });

  it("opens the payment only from the dialog's button", async () => {
    await act(async () => root.render(<KeepPlanButton summary={SUMMARY} />));
    await act(async () => button("Keep my plan").click());
    await act(async () => button("Go back").click());
    expect(keepPlan).not.toHaveBeenCalled();

    await act(async () => button("Keep my plan").click());
    const confirm = [...container.querySelectorAll("dialog button")].find((candidate) => candidate.textContent === "Keep my plan") as HTMLButtonElement;
    await act(async () => confirm.click());
    expect(keepPlan).toHaveBeenCalledTimes(1);
  });
});
