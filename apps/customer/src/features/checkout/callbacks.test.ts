import { describe, expect, it, vi } from "vitest";
import { POST as chargeCallback } from "@/app/billing/charges/callback/route";
import { POST as payCallback } from "@/app/billing/pay/callback/route";
import { POST as keepCallback } from "@/app/restore-account/keep-plan/callback/route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.example.test" }) }));

const post = (path: string, body: string) =>
  new Request(`https://app.example.test${path}`, { method: "POST", body, headers: { "content-type": "application/x-www-form-urlencoded" } });

const SUCCESS = "razorpay_payment_id=pay_1&razorpay_signature=sig";
const FAILURE = "error%5Bcode%5D=BAD_REQUEST_ERROR";

describe("Razorpay's return addresses (the old app's, kept for open checkouts)", () => {
  it("sends a plan payment back to the checkout with 303, saying how it went", async () => {
    const ok = await payCallback(post("/billing/pay/callback?for=managed", SUCCESS));
    expect(ok.status).toBe(303);
    expect(ok.headers.get("location")).toBe("https://app.example.test/checkout?payment=received");
    expect((await payCallback(post("/billing/pay/callback", FAILURE))).headers.get("location")).toBe("https://app.example.test/checkout?payment=failed");
  });

  it("sends a reactivation back to Plan & billing", async () => {
    expect((await payCallback(post("/billing/pay/callback?return=billing", SUCCESS))).headers.get("location")).toBe("https://app.example.test/billing?payment=received");
  });

  it("sends a charge back to where it was paid from, with the request's ticket for a change quote", async () => {
    const ticket = "0192f3c4-0000-7000-8000-000000000009";
    expect((await chargeCallback(post("/billing/charges/callback", SUCCESS))).headers.get("location")).toBe("https://app.example.test/billing?charge=processing");
    expect((await chargeCallback(post(`/billing/charges/callback?for=change&ticket=${ticket}`, FAILURE))).headers.get("location")).toBe(
      `https://app.example.test/requests?open=${ticket}&charge=failed`,
    );
  });

  it("sends a kept plan back to Restore your account, whatever happened", () => {
    const response = keepCallback();
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.test/restore-account");
  });
});
