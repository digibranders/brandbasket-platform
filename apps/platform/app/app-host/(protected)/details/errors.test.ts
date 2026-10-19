import { describe, expect, it } from "vitest";
import { CLOSURE_NOT_FOUND_MESSAGE, CLOSURE_PAST_MESSAGE, closureInPastState, closureNotFoundState } from "./errors";

/*
 * Only this page's own states live here now -- isCheckViolation, paymentRequiredState and unexpectedErrorState
 * moved to lib/server/panel-form-errors.ts (see its own test) once Appointments needed them too, and errorLogInfo
 * lives in @brandbasket/shared/server/error-log-info (see its own test).
 */

function form(entries: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) data.append(key, value);
  return data;
}

describe("closureNotFoundState", () => {
  it("names no field, whatever was submitted", () => {
    expect(closureNotFoundState(form({ closureId: "not-a-uuid" }))).toEqual({
      status: "error",
      message: CLOSURE_NOT_FOUND_MESSAGE,
      field: null,
      values: { closureId: "not-a-uuid" },
    });
  });
});

describe("closureInPastState", () => {
  it("points at endsOn", () => {
    expect(closureInPastState(form({ startsOn: "2020-01-01", endsOn: "2020-01-02" }))).toEqual({
      status: "error",
      message: CLOSURE_PAST_MESSAGE,
      field: "endsOn",
      values: { startsOn: "2020-01-01", endsOn: "2020-01-02" },
    });
  });
});
