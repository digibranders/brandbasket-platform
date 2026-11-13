// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelFormAction } from "@/components/panel/form/panel-form";
import type { PaymentSummary } from "@/lib/billing/payment-summary";
import { BundledAddOnAdd } from "./bundled-add-on-add";

const SUMMARY: PaymentSummary = {
  title: "Add Social Media Management",
  rows: [
    { key: "service", label: "Social Media Management, first month", amount: "₹1", tone: "plain" },
    { key: "plan", label: "Your plan, 12 November 2026 to 22 November 2026", amount: "₹967.42", tone: "plain" },
  ],
  totalLabel: "Due today",
  total: "₹968.42",
  notes: ["From 22 November 2026, you pay ₹5,998 a month for all your services.", "All prices include GST."],
};

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
const dialog = (): HTMLDialogElement => {
  const found = container.querySelector("dialog");
  if (found === null) throw new Error("No dialog");
  return found;
};

function render(action: PanelFormAction, summary: PaymentSummary | null): Promise<void> {
  return act(async () =>
    root.render(<BundledAddOnAdd addOn="social-media" title="Social Media Management" savedText="It is on." headingId="heading" action={action} summary={summary} />),
  );
}

describe("Add", () => {
  it("opens the confirmation with the lines and the total instead of sending", async () => {
    const action = vi.fn<PanelFormAction>(async () => ({ status: "saved" }));
    await render(action, SUMMARY);
    expect(dialog().open).toBe(false);

    await act(async () => button("Add").click());

    expect(dialog().open).toBe(true);
    for (const text of [
      "Add Social Media Management",
      "Social Media Management, first month",
      "₹1",
      "Your plan, 12 November 2026 to 22 November 2026",
      "₹967.42",
      "Due today",
      "₹968.42",
      "From 22 November 2026, you pay ₹5,998 a month for all your services.",
      "All prices include GST.",
    ]) {
      expect(dialog().textContent).toContain(text);
    }
    expect(action).not.toHaveBeenCalled();
  });

  it("sends nothing when the customer goes back", async () => {
    const action = vi.fn<PanelFormAction>(async () => ({ status: "saved" }));
    await render(action, SUMMARY);
    await act(async () => button("Add").click());
    await act(async () => button("Go back").click());

    expect(dialog().open).toBe(false);
    expect(action).not.toHaveBeenCalled();
  });

  it("sends the add-on, and only that, from the Pay button", async () => {
    const action = vi.fn<PanelFormAction>(async () => ({ status: "error", message: "Your payment is due within the hour.", field: null, values: {} }));
    await render(action, SUMMARY);
    await act(async () => button("Add").click());
    await act(async () => button("Pay ₹968.42").click());

    expect(action).toHaveBeenCalledTimes(1);
    const sent = action.mock.calls[0]?.[1];
    expect([...(sent?.entries() ?? [])]).toEqual([["addOn", "social-media"]]);
    // A refusal closes the dialog so the message shows beside the button.
    expect(dialog().open).toBe(false);
    expect(container.querySelector('[role="status"]')?.textContent).toBe("Your payment is due within the hour.");
  });

  it("sends at once, with no confirmation, when it takes nothing (keeping one that is ending)", async () => {
    const action = vi.fn<PanelFormAction>(async () => ({ status: "saved" }));
    await render(action, null);
    expect(container.querySelector("dialog")).toBeNull();

    await act(async () => button("Add").click());

    expect(action).toHaveBeenCalledTimes(1);
  });
});
