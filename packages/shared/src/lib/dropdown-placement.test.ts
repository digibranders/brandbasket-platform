import { describe, expect, it } from "vitest";
import { DROPDOWN_LIMITS, placeDropdown } from "./dropdown-placement";

const VIEWPORT = { width: 1280, height: 800 };
const trigger = (top: number, left = 100, width = 240) => ({ top, bottom: top + 40, left, width });

describe("placeDropdown", () => {
  it("opens below the trigger when the list fits there", () => {
    const placement = placeDropdown({ trigger: trigger(100), viewport: VIEWPORT, list: { width: 200, height: 200 } });
    expect(placement.side).toBe("below");
    expect(placement.offset).toBe(140 + DROPDOWN_LIMITS.gap);
    expect(placement.maxHeight).toBe(DROPDOWN_LIMITS.maxHeight);
  });

  it("flips above when the list would run past the bottom and there is more room above", () => {
    const placement = placeDropdown({ trigger: trigger(700), viewport: VIEWPORT, list: { width: 200, height: 260 } });
    expect(placement.side).toBe("above");
    // Anchored by its bottom edge, just above the trigger.
    expect(placement.offset).toBe(VIEWPORT.height - 700 + DROPDOWN_LIMITS.gap);
  });

  it("caps the height at the room on the chosen side, so the list scrolls instead of leaving the window", () => {
    const placement = placeDropdown({
      trigger: trigger(380),
      viewport: { width: 1280, height: 600 },
      list: { width: 200, height: 900 },
    });
    const roomBelow = 600 - 420 - DROPDOWN_LIMITS.gap - DROPDOWN_LIMITS.edge;
    const roomAbove = 380 - DROPDOWN_LIMITS.gap - DROPDOWN_LIMITS.edge;
    expect(placement.side).toBe("above");
    expect(placement.maxHeight).toBe(Math.min(DROPDOWN_LIMITS.maxHeight, roomAbove));
    expect(placement.maxHeight).toBeGreaterThan(roomBelow);
    // The capped list fits between the window top and the trigger.
    expect(600 - placement.offset - placement.maxHeight).toBeGreaterThanOrEqual(DROPDOWN_LIMITS.edge);
  });

  it("is never narrower than its trigger and never wider than 20rem or the window", () => {
    const narrow = placeDropdown({ trigger: trigger(100, 100, 240), viewport: VIEWPORT, list: { width: 120, height: 100 } });
    expect(narrow.width).toBe(240);

    const wide = placeDropdown({ trigger: trigger(100, 100, 80), viewport: VIEWPORT, list: { width: 900, height: 100 } });
    expect(wide.width).toBe(DROPDOWN_LIMITS.maxWidth);

    const phone = placeDropdown({
      trigger: trigger(100, 16, 80),
      viewport: { width: 320, height: 640 },
      list: { width: 900, height: 100 },
    });
    expect(phone.width).toBe(320 - DROPDOWN_LIMITS.edge * 2);
  });

  it("slides left rather than running off the right edge", () => {
    const placement = placeDropdown({ trigger: trigger(100, 1200, 60), viewport: VIEWPORT, list: { width: 300, height: 100 } });
    expect(placement.left + placement.width).toBeLessThanOrEqual(VIEWPORT.width - DROPDOWN_LIMITS.edge);
  });
});
