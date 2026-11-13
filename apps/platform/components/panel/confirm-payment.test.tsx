// @vitest-environment happy-dom
import { act, useActionState, useId } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PaymentSummary } from "@/lib/billing/payment-summary";
import { ConfirmPaymentDialog, useConfirmPayment } from "./confirm-payment";

type Result = { readonly ok: true } | { readonly ok: false; readonly message: string };

const SUMMARY: PaymentSummary = {
  title: "Add Social Media Management",
  rows: [
    { key: "service", label: "Social Media Management, first month", amount: "₹1", tone: "plain" },
    { key: "plan", label: "Your plan, Tue 1 Dec to Fri 11 Dec", amount: "₹967.42", tone: "plain" },
  ],
  totalLabel: "Due today",
  total: "₹968.42",
  notes: ["From Fri 11 Dec, you pay ₹5,998 a month for all your services.", "All prices include GST."],
};

/** A payment form as the screens build it: Pay asks, the dialog's button sends the form. */
function PayHere({ pay }: { readonly pay: (formData: FormData) => Promise<Result> }) {
  const formId = useId();
  const [state, action, pending] = useActionState((_previous: Result | null, formData: FormData) => pay(formData), null);
  const confirm = useConfirmPayment(state, pending);
  return (
    <form id={formId} action={action}>
      <input type="hidden" name="addOn" value="social-media" />
      {state !== null && !state.ok && !pending ? <p role="alert">{state.message}</p> : null}
      <button type="button" onClick={confirm.ask}>
        Add
      </button>
      <ConfirmPaymentDialog
        summary={SUMMARY}
        open={confirm.open}
        onClose={confirm.close}
        busy={pending}
        confirm={
          <button type="submit" form={formId}>
            {`Pay ${SUMMARY.total}`}
          </button>
        }
      />
    </form>
  );
}

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

describe("the payment confirmation", () => {
  it("shows every line, the total and what follows before anything is sent", async () => {
    const pay = vi.fn(async (): Promise<Result> => ({ ok: true }));
    await act(async () => root.render(<PayHere pay={pay} />));
    expect(dialog().open).toBe(false);

    await act(async () => button("Add").click());

    expect(dialog().open).toBe(true);
    for (const text of ["Add Social Media Management", "Social Media Management, first month", "₹1", "Your plan, Tue 1 Dec to Fri 11 Dec", "₹967.42", "Due today", "₹968.42", "All prices include GST."]) {
      expect(dialog().textContent).toContain(text);
    }
    expect(pay).not.toHaveBeenCalled();
  });

  it("sends nothing when the customer goes back", async () => {
    const pay = vi.fn(async (): Promise<Result> => ({ ok: true }));
    await act(async () => root.render(<PayHere pay={pay} />));
    await act(async () => button("Add").click());
    await act(async () => button("Go back").click());
    expect(dialog().open).toBe(false);
    expect(pay).not.toHaveBeenCalled();
  });

  it("sends the form from its own button, and closes on a refusal so the message shows on the page", async () => {
    const pay = vi.fn<(formData: FormData) => Promise<Result>>(async () => ({ ok: false, message: "Your payment is due within the hour." }));
    await act(async () => root.render(<PayHere pay={pay} />));
    await act(async () => button("Add").click());
    await act(async () => button("Pay ₹968.42").click());

    expect(pay).toHaveBeenCalledTimes(1);
    expect(pay.mock.calls[0]?.[0].get("addOn")).toBe("social-media");
    expect(dialog().open).toBe(false);
    expect(container.querySelector('[role="alert"]')?.textContent).toBe("Your payment is due within the hour.");

    await act(async () => button("Add").click());
    expect(dialog().open).toBe(true);
  });
});
