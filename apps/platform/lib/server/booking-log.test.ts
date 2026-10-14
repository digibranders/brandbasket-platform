import { describe, expect, it, vi } from "vitest";
import { loggableBookingError } from "./booking-log";

vi.mock("server-only", () => ({}));

describe("loggableBookingError", () => {
  it("carries only the businessId, the error's class name and null when there is no pg cause", () => {
    expect(loggableBookingError("biz-1", new Error("boom"))).toEqual({ businessId: "biz-1", errorName: "Error", pgCode: null });
  });

  it("reports UnknownError for a thrown value that isn't an Error", () => {
    expect(loggableBookingError("biz-1", "boom")).toEqual({ businessId: "biz-1", errorName: "UnknownError", pgCode: null });
  });

  it("never includes the error's own message, which can carry a patient's name, phone or note", () => {
    const patientDetails = "Asha Rao, +919876543210";
    const logged = loggableBookingError("biz-1", new Error(`Failed query params: ["${patientDetails}"]`));
    expect(JSON.stringify(logged)).not.toContain(patientDetails);
  });
});
