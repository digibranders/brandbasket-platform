import { LAUNCH_CHECK_KEYS, type LaunchCheckKey } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { launchChecksSentence } from "./launch-check-state";

describe("launchChecksSentence", () => {
  it("says every check is ticked when none is left", () => {
    expect(launchChecksSentence([...LAUNCH_CHECK_KEYS])).toBe("All checks are ticked.");
  });

  it("counts the checks left when some are unticked", () => {
    expect(launchChecksSentence([])).toBe(`${LAUNCH_CHECK_KEYS.length} checks left before you can go live.`);
    expect(launchChecksSentence(LAUNCH_CHECK_KEYS.slice(2))).toBe("2 checks left before you can go live.");
  });

  it("uses the singular when one check is left", () => {
    const lastOpen: LaunchCheckKey = "customer_informed";
    const done = LAUNCH_CHECK_KEYS.filter((key) => key !== lastOpen);
    expect(launchChecksSentence(done)).toBe("1 check left before you can go live.");
  });
});
