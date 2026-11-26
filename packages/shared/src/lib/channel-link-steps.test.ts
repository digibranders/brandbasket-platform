import { describe, expect, it } from "vitest";
import { inviteSteps, metaAppModeOf, personProfileNetworksOf, unconfirmedMenus } from "./channel-link-steps";

describe("metaAppModeOf and personProfileNetworksOf", () => {
  it("reads the app mode, the first app unless the setting says unified", () => {
    expect(metaAppModeOf("unified")).toBe("unified");
    expect(metaAppModeOf(" Unified ")).toBe("unified");
    expect(metaAppModeOf("classic")).toBe("classic");
    expect(metaAppModeOf(undefined)).toBe("classic");
    expect(metaAppModeOf("other")).toBe("classic");
  });

  it("reads the networks that need the person's profile", () => {
    expect(personProfileNetworksOf("facebook")).toEqual(["facebook"]);
    expect(personProfileNetworksOf("instagram, Facebook, instagram, tiktok")).toEqual(["instagram", "facebook"]);
    expect(personProfileNetworksOf(undefined)).toEqual([]);
  });
});

describe("inviteSteps", () => {
  const pairs = [
    ["instagram", "classic", "Instagram, then Settings"],
    ["instagram", "unified", "Facebook, then Settings"],
    ["facebook", "classic", "Facebook, then Settings"],
    ["facebook", "unified", "Facebook, then Settings"],
  ] as const;

  it.each(pairs)("gives the three steps for %s in %s mode, with the right menu and button", (network, mode, menu) => {
    const steps = inviteSteps(network, mode);
    expect(steps.steps).toHaveLength(3);
    expect(steps.steps[0]).toContain(menu);
    expect(steps.steps[1]).toContain(`press Allow ${network === "instagram" ? "Instagram" : "Facebook"}`);
    expect(steps.heading).toBe(`Your ${network === "instagram" ? "Instagram" : "Facebook"} is ready to connect`);
  });

  it("names the Instagram menu differently for the two apps", () => {
    expect(inviteSteps("instagram", "classic").steps[0]).not.toBe(inviteSteps("instagram", "unified").steps[0]);
  });

  it("lists the pairs whose Meta menu names are still placeholders", () => {
    expect(unconfirmedMenus()).toEqual(["instagram:classic", "instagram:unified", "facebook:classic", "facebook:unified"]);
  });
});
