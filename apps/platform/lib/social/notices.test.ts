import { describe, expect, it } from "vitest";
import { connectNoticeLine, socialNoticeLine } from "./notices";

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

describe("connectNoticeLine", () => {
  it("says which network was connected, and the others as problems", () => {
    expect(connectNoticeLine("connected", "instagram")).toEqual({ ok: true, text: "Instagram is connected. Posts from now on will also go there." });
    expect(connectNoticeLine("denied", "facebook")?.ok).toBe(false);
    expect(connectNoticeLine("failed", "linkedin")?.text).toContain("LinkedIn could not be connected");
  });

  it("does not name a network it does not know", () => {
    expect(connectNoticeLine("connected", "myspace")?.text).toContain("That account is connected");
    expect(connectNoticeLine("failed", undefined)?.text).toContain("That account could not be connected");
  });

  it("says when connecting is not available, and ignores anything else", () => {
    expect(connectNoticeLine("unavailable", undefined)).toEqual({ ok: false, text: "Connecting accounts is not available just now. Try again later, or ask us for help." });
    expect(connectNoticeLine("hacked", "instagram")).toBeNull();
    expect(connectNoticeLine(["connected"], "instagram")).toBeNull();
    expect(connectNoticeLine(undefined, "instagram")).toBeNull();
  });
});
