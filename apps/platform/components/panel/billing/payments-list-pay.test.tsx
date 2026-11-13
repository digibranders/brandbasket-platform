// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { chargeSummary } from "@/lib/billing/payment-summaries";
import type { BillingMonth } from "@/lib/billing/billing-months";
import { PaymentsList } from "./payments-list";

const { payChargeAction } = vi.hoisted(() => ({ payChargeAction: vi.fn<(formData: FormData) => Promise<void>>() }));
vi.mock("@/app/app-host/(protected)/billing/actions", () => ({ payChargeAction }));

const months: BillingMonth[] = [
  {
    key: "2026-10",
    label: "October 2026",
    total: "₹1,500",
    lines: [{ kind: "due", chargeId: "c1", title: "Extra page: Gallery", addedIso: "2026-10-27T06:00:00.000Z", amount: "₹1,500", taxNote: null, summary: chargeSummary("Extra page: Gallery", "₹1,500", "INR") }],
  },
];

const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLElement;
let root: Root;

beforeEach(() => {
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  payChargeAction.mockReset();
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

const button = (name: string): HTMLButtonElement => {
  const found = [...container.querySelectorAll("button")].find((candidate) => candidate.textContent?.startsWith(name));
  if (found === undefined) throw new Error(`No button "${name}"`);
  return found;
};

describe("Pay on an open charge", () => {
  it("confirms the charge before anything is sent, then posts its id from the dialog", async () => {
    payChargeAction.mockResolvedValue(undefined);
    await act(async () => root.render(<PaymentsList months={months} />));
    const dialog = container.querySelector("dialog");
    expect(dialog?.open).toBe(false);

    await act(async () => button("Pay for").click());
    expect(dialog?.open).toBe(true);
    for (const text of ["Pay this charge", "Extra page: Gallery", "₹1,500", "Due today", "A one-off payment."]) expect(dialog?.textContent).toContain(text);
    expect(payChargeAction).not.toHaveBeenCalled();

    await act(async () => button("Pay ₹1,500").click());
    expect(payChargeAction).toHaveBeenCalledTimes(1);
    expect(payChargeAction.mock.calls[0]?.[0].get("chargeId")).toBe("c1");
  });

  it("sends nothing when the customer goes back", async () => {
    await act(async () => root.render(<PaymentsList months={months} />));
    await act(async () => button("Pay for").click());
    await act(async () => button("Go back").click());
    expect(container.querySelector("dialog")?.open).toBe(false);
    expect(payChargeAction).not.toHaveBeenCalled();
  });
});
