import { describe, expect, it } from "vitest";
import { constraintOf, errorLogInfo, isConnectionFailure, providerErrorInfo } from "./error-log-info";

/** A driver error carrying a Postgres error code, the shape a real `pg` `DatabaseError` (and `postgresCodeOf`) look
 * for -- named literally `DatabaseError` in the cause-chain test below, matching the `pg` package's own class. */
class FakePgError extends Error {
  readonly code: string;
  readonly constraint: string | undefined;
  constructor(code: string, constraint?: string, message = "db exploded") {
    super(message);
    this.code = code;
    this.constraint = constraint;
  }
}

class FakeDrizzleQueryError extends Error {
  constructor(message: string, options: { readonly cause: unknown }) {
    super(message, options);
    this.name = "DrizzleQueryError";
  }
}

describe("errorLogInfo", () => {
  it("names the error and its Postgres code", () => {
    expect(errorLogInfo(new FakePgError("23514"))).toEqual({ errorName: "Error", pgCode: "23514" });
  });

  it("finds the code nested inside a wrapper's cause", () => {
    expect(errorLogInfo(new Error("wrapped", { cause: new FakePgError("23505") }))).toEqual({
      errorName: "Error",
      pgCode: "23505",
    });
  });

  it("finds the code several layers down a cause chain, e.g. a DrizzleQueryError wrapping a pg DatabaseError", () => {
    const patientDetails = "Asha Rao, +919876543210, please call about a filling";
    const cause = new FakePgError("23505");
    const error = new FakeDrizzleQueryError(
      `Failed query: insert into "appointment_requests" ... params: ["${patientDetails}"]`,
      { cause },
    );

    expect(errorLogInfo(error)).toEqual({ errorName: "DrizzleQueryError", pgCode: "23505" });
  });

  it("has a null pgCode for an error that carries none", () => {
    expect(errorLogInfo(new Error("boom"))).toEqual({ errorName: "Error", pgCode: null });
  });

  it("returns a null pgCode when nothing in the chain carries a code", () => {
    const error = new FakeDrizzleQueryError("Failed query", { cause: new Error("some other cause") });
    expect(errorLogInfo(error).pgCode).toBeNull();
  });

  it("still names something for a thrown non-Error", () => {
    expect(errorLogInfo("boom")).toEqual({ errorName: "UnknownError", pgCode: null });
  });

  it("never carries the error's own message or a query's params -- only errorName and pgCode, whatever the message says", () => {
    const patientDetails = "Asha Rao, +919876543210, please call about a filling";
    const sensitive = new FakeDrizzleQueryError(
      `Failed query: insert into "appointment_requests" (patient_name, phone) VALUES ('${patientDetails}')`,
      { cause: new FakePgError("23505") },
    );
    const info = errorLogInfo(sensitive);
    expect(Object.keys(info).sort()).toEqual(["errorName", "pgCode"]);
    expect(JSON.stringify(info)).not.toContain(patientDetails);
    expect(JSON.stringify(info)).not.toContain("Asha Rao");
  });
});

describe("constraintOf", () => {
  it("names the constraint a check or unique violation broke, from anywhere in the cause chain", () => {
    const cause = new FakePgError("23514", "tax_invoices_payment_check");
    expect(constraintOf(new FakeDrizzleQueryError("Failed query: ... params: [Asha Rao]", { cause }))).toBe("tax_invoices_payment_check");
  });

  it("is null when no error in the chain names one", () => {
    expect(constraintOf(new FakePgError("57014"))).toBeNull();
    expect(constraintOf(new Error("boom"))).toBeNull();
    expect(constraintOf("boom")).toBeNull();
  });
});

describe("providerErrorInfo", () => {
  it("reads Razorpay's rejection, a plain object with the code one level down", () => {
    const rejection = { statusCode: 502, error: { code: "SERVER_ERROR", description: "Asha Rao", reason: "x", metadata: { name: "Asha Rao" } } };
    expect(providerErrorInfo(rejection)).toEqual({ providerCode: "SERVER_ERROR", httpStatus: 502 });
  });

  it("reads a top-level code and status, as a network error or other SDK error carries them", () => {
    expect(providerErrorInfo(Object.assign(new Error("socket hang up"), { code: "ECONNRESET" }))).toEqual({ providerCode: "ECONNRESET", httpStatus: null });
    expect(providerErrorInfo({ status: 429 })).toEqual({ providerCode: null, httpStatus: 429 });
  });

  it("finds both in an error nested in a cause", () => {
    const wrapped = new Error("Could not cancel", { cause: { statusCode: 400, error: { code: "BAD_REQUEST_ERROR" } } });
    expect(providerErrorInfo(wrapped)).toEqual({ providerCode: "BAD_REQUEST_ERROR", httpStatus: 400 });
  });

  it("takes only a code that looks like one and a status that looks like HTTP", () => {
    expect(providerErrorInfo({ code: "Asha Rao called", statusCode: 99 })).toEqual({ providerCode: null, httpStatus: null });
    expect(providerErrorInfo({ error: { code: "x" }, statusCode: 600 })).toEqual({ providerCode: null, httpStatus: null });
    expect(providerErrorInfo({ code: "A".repeat(65), status: 200.5 })).toEqual({ providerCode: null, httpStatus: null });
    expect(providerErrorInfo({ code: 500, statusCode: "400" })).toEqual({ providerCode: null, httpStatus: null });
  });

  it("is empty for anything that is not an object, and never reads free text", () => {
    expect(providerErrorInfo("Asha Rao")).toEqual({ providerCode: null, httpStatus: null });
    expect(providerErrorInfo(null)).toEqual({ providerCode: null, httpStatus: null });
    const info = providerErrorInfo({ message: "Asha Rao", description: "Asha Rao", error: { description: "Asha Rao", reason: "Asha Rao", field: "Asha Rao" } });
    expect(JSON.stringify(info)).not.toContain("Asha");
  });

  it("stops at a cause chain that loops back on itself", () => {
    const loop: { cause?: unknown } = {};
    loop.cause = loop;
    expect(providerErrorInfo(loop)).toEqual({ providerCode: null, httpStatus: null });
  });
});

describe("isConnectionFailure", () => {
  it("knows a lost or refused connection by its Postgres or socket code", () => {
    for (const code of ["08000", "08001", "08003", "08004", "08006", "08007"]) {
      expect(isConnectionFailure(new FakePgError(code))).toBe(true);
    }
    expect(isConnectionFailure(new FakePgError("57P01"))).toBe(true);
    expect(isConnectionFailure(new FakePgError("57P03"))).toBe(true);
    expect(isConnectionFailure(new FakeDrizzleQueryError("Failed query", { cause: new FakePgError("ECONNRESET") }))).toBe(true);
  });

  it("knows the pg client's own messages for a connection that went away", () => {
    expect(isConnectionFailure(new Error("Connection terminated unexpectedly"))).toBe(true);
    expect(isConnectionFailure(new FakeDrizzleQueryError("Failed query", { cause: new Error("Client was closed and is not queryable") }))).toBe(
      true,
    );
  });

  it("does not treat a protocol fault (08P01) as a lost connection", () => {
    expect(isConnectionFailure(new FakePgError("08P01"))).toBe(false);
  });

  it("never reads the message of a query error, which embeds the query's params", () => {
    const queryError = Object.assign(new FakeDrizzleQueryError("Failed query: ... params: Connection terminated Asha Rao", { cause: new FakePgError("23505") }), {
      query: "insert into tax_invoices ...",
      params: ["Asha Rao"],
    });
    expect(isConnectionFailure(queryError)).toBe(false);
  });

  it("still reads the message of the driver error beneath a query error", () => {
    const queryError = Object.assign(new FakeDrizzleQueryError("Failed query: ...", { cause: new Error("Connection terminated unexpectedly") }), {
      query: "select 1",
      params: [],
    });
    expect(isConnectionFailure(queryError)).toBe(true);
  });

  it("leaves query failures alone", () => {
    expect(isConnectionFailure(new FakePgError("23514", "tax_invoices_payment_check"))).toBe(false);
    expect(isConnectionFailure(new FakePgError("57014"))).toBe(false);
    expect(isConnectionFailure(new RangeError("A quantity must be a whole number from 1, received 0"))).toBe(false);
    expect(isConnectionFailure("boom")).toBe(false);
  });
});
