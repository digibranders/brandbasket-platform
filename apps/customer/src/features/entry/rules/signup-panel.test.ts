import { describe, expect, it } from "vitest";
import { signUpPanelCopy, WEBSITE_LAUNCH_STEPS } from "./signup-panel";

describe("signUpPanelCopy", () => {
  it("returns website steps when managed-website is chosen", () => {
    const copy = signUpPanelCopy(["managed-website"]);
    expect(copy.steps).toEqual(WEBSITE_LAUNCH_STEPS);
    expect(copy.steps).toContain("We build your website.");
    expect(copy.promise).toBe("Then we look after it, every month.");
    expect(copy.heading.title).toBe("Create your account.");
  });

  it("returns social steps when social-media alone is chosen", () => {
    const copy = signUpPanelCopy(["social-media"]);
    expect(copy.steps).not.toContain("We build your website.");
    expect(copy.steps).toContain("We create your posts.");
    expect(copy.promise).toBe("Then we grow your audience, every month.");
    expect(copy.heading.title).toBe("Start your social media.");
  });

  it("returns ads steps when paid-ads alone is chosen", () => {
    const copy = signUpPanelCopy(["paid-ads"]);
    expect(copy.steps).not.toContain("We build your website.");
    expect(copy.steps).toContain("We build your campaigns.");
    expect(copy.promise).toBe("Then we optimise your ads, every month.");
    expect(copy.heading.title).toBe("Start your paid ads.");
  });

  it("returns bundle steps when social and ads are chosen together without website", () => {
    const copy = signUpPanelCopy(["social-media", "paid-ads"]);
    expect(copy.steps).not.toContain("We build your website.");
    expect(copy.steps).toContain("We create your campaigns.");
    expect(copy.promise).toBe("Then we manage your growth, every month.");
    expect(copy.heading.title).toBe("Grow your business.");
  });

  it("returns team invite steps when signing up from an invite", () => {
    const copy = signUpPanelCopy(["managed-website"], true);
    expect(copy.steps).not.toContain("We build your website.");
    expect(copy.steps).toContain("Join your team.");
    expect(copy.promise).toBe("Welcome to Brandbasket.");
    expect(copy.heading.title).toBe("Join your team.");
  });

  it("contains no em or en dashes in any customer facing copy", () => {
    const allServices = [
      ["managed-website"],
      ["social-media"],
      ["paid-ads"],
      ["social-media", "paid-ads"],
      [],
    ] as const;

    for (const services of allServices) {
      for (const invite of [false, true]) {
        const copy = signUpPanelCopy(services, invite);
        const text = JSON.stringify(copy);
        expect(text).not.toContain("\u2014");
        expect(text).not.toContain("\u2013");
      }
    }
  });
});
