// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { NextStep } from "@/lib/requests/status";
import { NextStepBox } from "./next-step-box";

const mocks = vi.hoisted(() => ({
  payChargeAction: vi.fn<(formData: FormData) => Promise<void>>(),
  acceptQuoteAction: vi.fn<(formData: FormData) => Promise<void>>(),
}));
vi.mock("@/app/app-host/(protected)/billing/actions", () => ({ payChargeAction: mocks.payChargeAction }));
vi.mock("@/app/app-host/(protected)/requests/pay-actions", () => ({ acceptQuoteAction: mocks.acceptQuoteAction }));
vi.mock("@/app/app-host/(protected)/requests/move-actions", () => ({ approveChangeAction: vi.fn(), declineQuoteAction: vi.fn(), reopenRequestAction: vi.fn() }));

const QUOTE = { line: "2 hours at ₹950", total: "₹2,242" };
const accept: NextStep = { title: "Waiting for you", text: "Needs your OK.", quote: QUOTE, action: { kind: "accept", label: "Accept and pay ₹2,242" }, secondary: null };
const pay: NextStep = { title: "Waiting for your payment", text: "Pay now.", quote: QUOTE, action: { kind: "pay", label: "Pay ₹2,242", chargeId: "charge-1" }, secondary: null };

const globals = globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean };
let container: HTMLElement;
let root: Root;

beforeEach(() => {
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  mocks.payChargeAction.mockReset().mockResolvedValue(undefined);
  mocks.acceptQuoteAction.mockReset().mockResolvedValue(undefined);
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
const show = (step: NextStep): Promise<void> => act(async () => root.render(<NextStepBox step={step} requestId="req-1" ticketId="ticket-1" />));

describe("a request's quote", () => {
  it("shows the change and its total before accepting, then posts the request and ticket ids", async () => {
    await show(accept);
    await act(async () => button("Accept and pay ₹2,242").click());
    const dialog = container.querySelector("dialog");
    expect(dialog?.open).toBe(true);
    for (const text of ["Pay for this change", "2 hours at ₹950", "₹2,242", "Due today"]) expect(dialog?.textContent).toContain(text);
    expect(mocks.acceptQuoteAction).not.toHaveBeenCalled();

    await act(async () => button("Pay ₹2,242").click());
    const sent = mocks.acceptQuoteAction.mock.calls[0]?.[0];
    expect(sent?.get("requestId")).toBe("req-1");
    expect(sent?.get("ticketId")).toBe("ticket-1");
  });

  it("confirms paying an open charge too, and posts its id", async () => {
    await show(pay);
    await act(async () => button("Pay ₹2,242").click());
    expect(mocks.payChargeAction).not.toHaveBeenCalled();
    const confirm = [...container.querySelectorAll("dialog button")].find((candidate) => candidate.textContent === "Pay ₹2,242") as HTMLButtonElement;
    await act(async () => confirm.click());
    expect(mocks.payChargeAction.mock.calls[0]?.[0].get("chargeId")).toBe("charge-1");
  });
});
