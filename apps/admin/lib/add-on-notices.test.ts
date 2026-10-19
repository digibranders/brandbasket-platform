import { describe, expect, it } from "vitest";
import type { AddOnEndOutcome } from "@brandbasket/shared/server/add-on-ends";
import { ADD_ON_NOTICES, addOnNoticeHref, noticeForEndOutcome, readAddOnNotice } from "./add-on-notices";

const ENDS_ON = new Date("2026-11-12T09:00:00Z");

describe("the client page's add-on notices", () => {
  it("reads the notices an address names, and nothing else", () => {
    for (const key of Object.keys(ADD_ON_NOTICES)) expect(readAddOnNotice(key)).toBe(key);
    expect(readAddOnNotice("<script>alert(1)</script>")).toBeNull();
    expect(readAddOnNotice("Digital Growth was cancelled")).toBeNull();
    expect(readAddOnNotice(["cancel-scheduled"])).toBeNull();
    expect(readAddOnNotice("toString")).toBeNull();
    expect(readAddOnNotice("__proto__")).toBeNull();
    expect(readAddOnNotice(undefined)).toBeNull();
  });

  it("scrolls back to the Add-ons section", () => {
    expect(addOnNoticeHref("abc", "contacted")).toBe("/clients/abc?addOns=contacted#add-ons");
  });

  it("calls only a change that happened a success", () => {
    const ok = Object.entries(ADD_ON_NOTICES).filter(([, notice]) => notice.ok).map(([key]) => key);
    expect(ok.sort()).toEqual(
      [
        "add-on-charge-opened",
        "add-on-kept",
        "add-on-on",
        "add-on-removal-scheduled",
        "cancel-scheduled",
        "contacted",
        "keep-undone-cancel",
        "keep-undone-pause",
        "pause-scheduled",
        "provider-told",
        "release-in-progress",
        "release-published",
      ].sort(),
    );
  });

  it("is written in plain words, with no em or en dashes", () => {
    for (const { text } of Object.values(ADD_ON_NOTICES)) {
      expect(text).not.toMatch(/[–—]/);
      expect(text.length).toBeGreaterThan(10);
    }
  });

  it("turns each result of an end into its own fixed notice", () => {
    const scheduled = (endKind: "cancel" | "pause"): AddOnEndOutcome => ({ kind: "scheduled", addOn: "digital-growth", endKind, endsOn: ENDS_ON });
    const undone = (endKind: "cancel" | "pause"): AddOnEndOutcome => ({ kind: "keep-undone", addOn: "digital-growth", endKind, endsOn: ENDS_ON });
    const refused = (reason: Extract<AddOnEndOutcome, { kind: "refused" }>["reason"]): AddOnEndOutcome => ({
      kind: "refused",
      reason,
      addOn: "digital-growth",
      endKind: null,
      endsOn: null,
    });
    expect(noticeForEndOutcome(scheduled("cancel"))).toBe("cancel-scheduled");
    expect(noticeForEndOutcome(scheduled("pause"))).toBe("pause-scheduled");
    expect(noticeForEndOutcome(undone("cancel"))).toBe("keep-undone-cancel");
    expect(noticeForEndOutcome(undone("pause"))).toBe("keep-undone-pause");
    expect(noticeForEndOutcome(refused("not-found"))).toBe("not-found");
    expect(noticeForEndOutcome(refused("not-running"))).toBe("not-running");
    expect(noticeForEndOutcome(refused("already-ending"))).toBe("already-ending");
    expect(noticeForEndOutcome(refused("provider-unavailable"))).toBe("provider-unavailable");
    expect(noticeForEndOutcome(refused("changed-meanwhile"))).toBe("changed-meanwhile");
  });
});
