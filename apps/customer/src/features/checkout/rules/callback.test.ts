import { describe, expect, it } from "vitest";
import { razorpayReportedFailure } from "./callback";

const post = (body: string, type = "application/x-www-form-urlencoded") =>
  new Request("http://localhost/billing/pay/callback", { method: "POST", body, headers: { "content-type": type } });

describe("razorpayReportedFailure", () => {
  it("reads a success post as no failure", async () => {
    expect(await razorpayReportedFailure(post("razorpay_payment_id=pay_1&razorpay_subscription_id=sub_1&razorpay_signature=x"))).toBe(false);
  });

  it("reads any error field as a failure", async () => {
    expect(await razorpayReportedFailure(post("error%5Bcode%5D=BAD_REQUEST_ERROR&error%5Bdescription%5D=Declined"))).toBe(true);
    expect(await razorpayReportedFailure(post("error=1"))).toBe(true);
  });

  it("reads a body it cannot parse as a failure", async () => {
    expect(await razorpayReportedFailure(post("{not form}", "application/json"))).toBe(true);
  });
});
