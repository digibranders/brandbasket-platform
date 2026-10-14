import { BillingRangeError } from "@firstfold/billing/billing-range-error";
import { UnknownStateError } from "@firstfold/billing/gst-states";
import { InvalidGstinError } from "@firstfold/billing/gstin";
import { InvoiceAmountMismatchError } from "@firstfold/billing/tax-invoice";
import { describe, expect, it, vi } from "vitest";
import { describeError } from "./billing-log";

vi.mock("server-only", () => ({}));

class FakePgError extends Error {
  readonly code = "23514";
  readonly constraint = "tax_invoices_payment_check";
}

class FakeDrizzleQueryError extends Error {
  constructor(message: string, options: { readonly cause: unknown }) {
    super(message, options);
    this.name = "DrizzleQueryError";
  }
}

describe("describeError", () => {
  it("never logs a database error's message, which carries the query's params, but names its code and constraint", () => {
    const error = new FakeDrizzleQueryError('Failed query: insert into "tax_invoices" ... params: QA Premium Business LLP,27AAPFU0939F1ZV', {
      cause: new FakePgError("new row violates check constraint"),
    });

    const described = describeError(error);

    expect(described).toEqual({
      errorName: "DrizzleQueryError",
      pgCode: "23514",
      constraint: "tax_invoices_payment_check",
      providerCode: "23514",
      httpStatus: null,
      errorMessage: null,
    });
    expect(JSON.stringify(described)).not.toContain("27AAPFU0939F1ZV");
    expect(JSON.stringify(described)).not.toContain("QA Premium");
  });

  it("drops the message of any error it does not know to be free of customer details", () => {
    const none = { pgCode: null, constraint: null, providerCode: null, httpStatus: null, errorMessage: null };
    expect(describeError(new Error("Asha Rao +919876543210"))).toEqual({ errorName: "Error", ...none });
    expect(describeError("Asha Rao")).toEqual({ errorName: "UnknownError", ...none });
  });

  it("keeps the message of our own invoice errors, which hold only codes and amounts", () => {
    expect(describeError(new UnknownStateError("xx")).errorMessage).toEqual(expect.stringContaining("xx"));
    expect(describeError(new InvoiceAmountMismatchError(100, 200)).errorMessage).toBe("Invoice lines come to 100 but 200 was charged");
    expect(describeError(new InvalidGstinError()).errorMessage).toBe("Not a valid GSTIN");
    expect(describeError(new BillingRangeError("A quantity must be a whole number from 1, received 0")).errorMessage).toBe(
      "A quantity must be a whole number from 1, received 0",
    );
  });

  it("drops the message of a bare RangeError, which other code throws with input quoted in it", () => {
    expect(describeError(new RangeError('"Asha Rao" is not a market')).errorMessage).toBeNull();
  });

  it("keeps a Razorpay rejection's code and HTTP status but never its description", () => {
    // The SDK rejects with a plain object, not an Error.
    const rejection = {
      statusCode: 400,
      error: { code: "BAD_REQUEST_ERROR", description: "Customer Asha Rao has no card on file", reason: "input_validation_failed", field: "name" },
    };

    const described = describeError(rejection);

    expect(described).toEqual({
      errorName: "UnknownError",
      pgCode: null,
      constraint: null,
      providerCode: "BAD_REQUEST_ERROR",
      httpStatus: 400,
      errorMessage: null,
    });
    expect(JSON.stringify(described)).not.toContain("Asha");
  });

  it("keeps a network error's code, and never a customer's name held in its message or description", () => {
    const network = Object.assign(new Error("connect ECONNRESET for Asha Rao"), { code: "ECONNRESET", description: "Asha Rao" });

    const described = describeError(network);

    expect(described.providerCode).toBe("ECONNRESET");
    expect(described.errorMessage).toBeNull();
    expect(JSON.stringify(described)).not.toContain("Asha");
  });
});
