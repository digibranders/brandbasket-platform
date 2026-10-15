import { createHmac } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.example.test" }) }));
vi.mock("@/lib/server/billing", () => ({ razorpayKeySecret: () => SECRET }));

const SECRET = "rzp_test_key_secret";

function signature(paymentId: string, subscriptionId: string): string {
  return createHmac("sha256", SECRET).update(`${paymentId}|${subscriptionId}`, "utf8").digest("hex");
}

function post(fields: Record<string, string>, query = ""): Request {
  const body = new URLSearchParams(fields);
  return new Request(`https://app.example.test/add-ons/pay/callback${query}`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body,
  });
}

beforeEach(() => {
  vi.clearAllMocks();
});

describe("POST /add-ons/pay/callback", () => {
  it("sends a signed payment back to Add-ons as received", async () => {
    const response = await POST(
      post({
        razorpay_payment_id: "pay_1",
        razorpay_subscription_id: "sub_1",
        razorpay_signature: signature("pay_1", "sub_1"),
      }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.test/add-ons?payment=received");
  });

  it("says failed for a payment whose signature does not check out, never received", async () => {
    const response = await POST(
      post({ razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_1", razorpay_signature: signature("pay_2", "sub_1") }),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.test/add-ons?payment=failed");
  });

  it("sends a signed Keep it return to the kept notice, never to received", async () => {
    const response = await POST(
      post(
        {
          razorpay_payment_id: "pay_1",
          razorpay_subscription_id: "sub_1",
          razorpay_signature: signature("pay_1", "sub_1"),
        },
        "?kept=social-media",
      ),
    );
    expect(response.status).toBe(303);
    expect(response.headers.get("location")).toBe("https://app.example.test/add-ons?payment=kept&addOn=social-media");
  });

  it("says failed for a Keep it return whose signature does not check out", async () => {
    const response = await POST(
      post(
        { razorpay_payment_id: "pay_1", razorpay_subscription_id: "sub_1", razorpay_signature: signature("pay_2", "sub_1") },
        "?kept=social-media",
      ),
    );
    expect(response.headers.get("location")).toBe("https://app.example.test/add-ons?payment=failed");
  });

  it("says failed for a declined Keep it", async () => {
    const response = await POST(post({ "error[code]": "BAD_REQUEST_ERROR" }, "?kept=social-media"));
    expect(response.headers.get("location")).toBe("https://app.example.test/add-ons?payment=failed");
  });

  it("treats a kept mark it does not know as no mark at all", async () => {
    const fields = {
      razorpay_payment_id: "pay_1",
      razorpay_subscription_id: "sub_1",
      razorpay_signature: signature("pay_1", "sub_1"),
    };
    const response = await POST(post(fields, "?kept=press-release"));
    expect(response.headers.get("location")).toBe("https://app.example.test/add-ons?payment=received");
  });

  it("says failed for a decline", async () => {
    const response = await POST(post({ "error[code]": "BAD_REQUEST_ERROR", "error[description]": "Payment failed" }));
    expect(response.headers.get("location")).toBe("https://app.example.test/add-ons?payment=failed");
  });

  it("says failed for a post with nothing in it, and for one it cannot read", async () => {
    const empty = await POST(post({}));
    expect(empty.headers.get("location")).toBe("https://app.example.test/add-ons?payment=failed");

    const unreadable = await POST(
      new Request("https://app.example.test/add-ons/pay/callback", {
        method: "POST",
        headers: { "content-type": "multipart/form-data; boundary=nope" },
        body: "not a form",
      }),
    );
    expect(unreadable.status).toBe(303);
    expect(unreadable.headers.get("location")).toBe("https://app.example.test/add-ons?payment=failed");
  });
});
