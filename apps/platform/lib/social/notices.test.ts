import { describe, expect, it } from "vitest";
import { socialNoticeLine } from "./notices";

describe("socialNoticeLine", () => {
  it("thanks the customer when the posts were approved", () => {
    expect(socialNoticeLine("approved")).toEqual({ ok: true, text: "Approved. Thank you, we will publish on the dates shown." });
  });

  it("says plainly when posts changed or the save failed, as problems", () => {
    expect(socialNoticeLine("changed")).toEqual({ ok: false, text: "Some posts changed while you were looking. Check them below and try again." });
    expect(socialNoticeLine("failed")).toEqual({ ok: false, text: "We could not save that. Try again." });
  });

  it("ignores anything else", () => {
    expect(socialNoticeLine("toString")).toBeNull();
    expect(socialNoticeLine("")).toBeNull();
    expect(socialNoticeLine(["approved"])).toBeNull();
    expect(socialNoticeLine(undefined)).toBeNull();
  });
});
