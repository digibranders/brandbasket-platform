import { fireEvent, render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ToastProvider } from "@/ui";
import { changePaymentMethodAction } from "../actions";
import { PaymentMethodRequest } from "./payment-method-request";

vi.mock("../actions", () => ({
  changePaymentMethodAction: vi.fn(),
}));

const wrap = (node: ReactNode) => render(<ToastProvider>{node}</ToastProvider>);

beforeEach(() => {
  vi.clearAllMocks();
});

describe("PaymentMethodRequest", () => {
  it("opens dialog on clicking Change and triggers changePaymentMethodAction on submit", async () => {
    vi.mocked(changePaymentMethodAction).mockResolvedValue({ ok: true, data: undefined });
    wrap(<PaymentMethodRequest />);

    const changeButton = screen.getByRole("button", { name: "Change" });
    expect(changeButton).toBeTruthy();

    fireEvent.click(changeButton);
    expect(screen.getByText("Change payment method")).toBeTruthy();
    expect(screen.getByText(/redirected to Razorpay/i)).toBeTruthy();

    const submitButton = screen.getByRole("button", { name: "Change on Razorpay" });
    expect(submitButton).toBeTruthy();

    fireEvent.click(submitButton);
    expect(changePaymentMethodAction).toHaveBeenCalledTimes(1);
  });

  it("displays error banner when action returns failure", async () => {
    vi.mocked(changePaymentMethodAction).mockResolvedValue({ ok: false, message: "Could not open payment update" });
    wrap(<PaymentMethodRequest />);

    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("button", { name: "Change on Razorpay" }));

    expect(await screen.findByText("Could not open payment update")).toBeTruthy();
  });
});
