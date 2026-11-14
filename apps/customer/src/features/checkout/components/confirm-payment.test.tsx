import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useActionState, useId } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ActionResult } from "@/lib/action-result";
import { Banner, Button } from "@/ui";
import { expectNoAxeViolations } from "@/ui/test-axe";
import type { PaymentSummary } from "../rules/payment-summary";
import { ConfirmPaymentDialog, useConfirmPayment } from "./confirm-payment";

const SUMMARY: PaymentSummary = {
  title: "Add Social Media Management",
  rows: [
    { key: "service", label: "Social Media Management, first month offer", amount: "₹1", tone: "plain" },
    { key: "plan", label: "Current plan, 10 extra days", amount: "₹967.42", tone: "plain" },
  ],
  totalLabel: "Due today",
  total: "₹968.42",
  notes: ["Then ₹5,998 a month for all your services, from Wed 11 Dec.", "All prices include GST."],
};

/** A payment form as the screens build it: Pay asks, the dialog's button sends the form. */
function PayHere({ pay }: { readonly pay: (formData: FormData) => Promise<ActionResult> }) {
  const formId = useId();
  const [state, action, pending] = useActionState((_previous: ActionResult | null, formData: FormData) => pay(formData), null);
  const confirm = useConfirmPayment(state, pending);
  return (
    <form id={formId} action={action}>
      <input type="hidden" name="addOn" value="social-media" />
      {state !== null && !state.ok && !pending ? <Banner tone="neg">{state.message}</Banner> : null}
      <Button onClick={confirm.ask}>Add</Button>
      <ConfirmPaymentDialog
        summary={SUMMARY}
        open={confirm.open}
        onClose={confirm.close}
        confirm={
          <Button type="submit" form={formId} variant="primary" pending={pending}>
            {`Pay ${SUMMARY.total}`}
          </Button>
        }
      />
    </form>
  );
}

describe("the payment confirmation", () => {
  it("shows every line, the total and what follows before anything is sent", async () => {
    const pay = vi.fn(async (): Promise<ActionResult> => ({ ok: true }));
    render(<PayHere pay={pay} />);
    await userEvent.click(screen.getByRole("button", { name: "Add" }));

    const dialog = await screen.findByRole("dialog", { name: "Add Social Media Management" });
    for (const text of ["Social Media Management, first month offer", "₹1", "Current plan, 10 extra days", "₹967.42", "Due today", "₹968.42", "All prices include GST."]) {
      expect(dialog.textContent).toContain(text);
    }
    expect(pay).not.toHaveBeenCalled();
    await expectNoAxeViolations(document.body);
  });

  it("sends nothing when the customer goes back", async () => {
    const pay = vi.fn(async (): Promise<ActionResult> => ({ ok: true }));
    render(<PayHere pay={pay} />);
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await userEvent.click(await screen.findByRole("button", { name: "Go back" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pay).not.toHaveBeenCalled();
  });

  it("sends the form from its own button, and closes on a refusal so the message shows on the page", async () => {
    const pay = vi.fn<(formData: FormData) => Promise<ActionResult>>(async () => ({ ok: false, message: "Your payment is due within the hour." }));
    render(<PayHere pay={pay} />);
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    await userEvent.click(await screen.findByRole("button", { name: "Pay ₹968.42" }));

    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(pay).toHaveBeenCalledTimes(1);
    expect(pay.mock.calls[0]?.[0].get("addOn")).toBe("social-media");
    expect(screen.getByText("Your payment is due within the hour.")).toBeTruthy();

    // Pressing again asks again.
    await userEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(await screen.findByRole("dialog", { name: "Add Social Media Management" })).toBeTruthy();
  });
});
