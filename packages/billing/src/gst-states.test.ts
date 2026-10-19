import { INDIA_STATES } from "@brandbasket/db/india-states";
import { describe, expect, it } from "vitest";
import { gstStateCodeOf, stateCodeOfGstCode, UnknownStateError } from "./gst-states";

describe("GST state codes", () => {
  it("gives every state and union territory on the platform its GST code, with no code used twice", () => {
    const codes = INDIA_STATES.map((state) => gstStateCodeOf(state.code));
    expect(codes).toHaveLength(36);
    expect(new Set(codes).size).toBe(36);
  });

  it("maps the codes Brandbasket deals with most", () => {
    expect(gstStateCodeOf("mh")).toBe("27");
    expect(gstStateCodeOf("ka")).toBe("29");
    expect(gstStateCodeOf("dh")).toBe("26");
    expect(gstStateCodeOf("la")).toBe("38");
  });

  it("goes back from a GST code to the platform's state code", () => {
    expect(stateCodeOfGstCode("27")).toBe("mh");
    expect(stateCodeOfGstCode("07")).toBe("dl");
  });

  it("knows nothing of codes that are not a state: 96 (other country), 97 (other territory), 99", () => {
    expect(stateCodeOfGstCode("96")).toBeNull();
    expect(stateCodeOfGstCode("97")).toBeNull();
    expect(stateCodeOfGstCode("99")).toBeNull();
  });

  it("knows nothing of codes that are not a state: 25 was retired", () => {
    expect(stateCodeOfGstCode("25")).toBeNull();
  });

  it("refuses a state code it does not know", () => {
    expect(() => gstStateCodeOf("xx")).toThrow(UnknownStateError);
  });

  it("does not mistake names on the object prototype for state codes", () => {
    expect(() => gstStateCodeOf("constructor")).toThrow(UnknownStateError);
    expect(() => gstStateCodeOf("toString")).toThrow(UnknownStateError);
    expect(() => gstStateCodeOf("__proto__")).toThrow(UnknownStateError);
  });
});
