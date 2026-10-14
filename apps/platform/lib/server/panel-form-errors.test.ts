import { describe, expect, it, vi } from "vitest";

/*
 * panel-form-errors.ts does no I/O of its own -- no logging, no queries -- so it's tested directly, with only its
 * one external dependency (the payment message) replaced, rather than mocking "server-only" and pulling in
 * lib/server/blog-access.ts's whole billing import chain just to read a string constant.
 */
vi.mock("@/lib/server/blog-access", () => ({
  PAID_PLAN_REQUIRED_MESSAGE: "This opens once your plan is paid. You can pay from Billing.",
}));

const { CHECK_VIOLATION_MESSAGE, GENERIC_ERROR_MESSAGE, isCheckViolation, paymentRequiredState, unexpectedErrorState } =
  await import("./panel-form-errors");

function form(entries: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

/** A driver error carrying a Postgres error code, the shape hasPostgresCode/postgresCodeOf look for. */
class FakePgError extends Error {
  readonly code: string;
  constructor(code: string) {
    super("db exploded");
    this.code = code;
  }
}

describe("isCheckViolation", () => {
  it("is true for a Postgres check_violation", () => {
    expect(isCheckViolation(new FakePgError("23514"))).toBe(true);
  });

  it("is true for one nested inside a wrapper's cause", () => {
    expect(isCheckViolation(new Error("wrapped", { cause: new FakePgError("23514") }))).toBe(true);
  });

  it("is false for any other error, including a different Postgres code", () => {
    expect(isCheckViolation(new FakePgError("23505"))).toBe(false);
    expect(isCheckViolation(new Error("boom"))).toBe(false);
    expect(isCheckViolation("not an error")).toBe(false);
    expect(isCheckViolation(null)).toBe(false);
  });
});

describe("paymentRequiredState", () => {
  it("echoes what was submitted alongside the payment message", () => {
    expect(paymentRequiredState(form({ message: "Closed today" }))).toEqual({
      status: "error",
      message: "This opens once your plan is paid. You can pay from Billing.",
      field: null,
      values: { message: "Closed today" },
    });
  });
});

describe("unexpectedErrorState", () => {
  it("answers with the check-violation message for a check_violation, even nested in a wrapper", () => {
    expect(unexpectedErrorState(new Error("wrapped", { cause: new FakePgError("23514") }), form({ startsOn: "2026-10-01" }))).toEqual({
      status: "error",
      message: CHECK_VIOLATION_MESSAGE,
      field: null,
      values: { startsOn: "2026-10-01" },
    });
  });

  it("answers with the generic message for anything else", () => {
    expect(unexpectedErrorState(new Error("connection reset"), form())).toEqual({
      status: "error",
      message: GENERIC_ERROR_MESSAGE,
      field: null,
      values: {},
    });
  });
});
