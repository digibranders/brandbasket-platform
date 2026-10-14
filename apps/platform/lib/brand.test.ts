import { describe, expect, it } from "vitest";
import { BRANDS, brandedLabel, brandedPlanName, brandText, FYNIX_DEFAULT_CHOICE, offersChoice, sellsFreeListing, isDirectoryOnlyPath } from "./brand";

describe("brands", () => {
  it("sells all three plans under Firstfold, as before", () => {
    expect(BRANDS.firstfold.joinChoices).toEqual(["listing_only", "care", "premium"]);
    expect(sellsFreeListing(BRANDS.firstfold)).toBe(true);
    expect(BRANDS.firstfold.logo).toBeNull();
    expect(BRANDS.firstfold.name).toBe("Firstfold");
  });

  it("sells Care and Premium only under Fynix, Care first", () => {
    expect(BRANDS.fynix.joinChoices).toEqual(["care", "premium"]);
    expect(sellsFreeListing(BRANDS.fynix)).toBe(false);
    expect(offersChoice(BRANDS.fynix, "listing_only")).toBe(false);
    expect(offersChoice(BRANDS.fynix, "care")).toBe(true);
    expect(offersChoice(BRANDS.fynix, "premium")).toBe(true);
    expect(BRANDS.fynix.name).toBe("Fynix Digital");
  });

  it("opens accounts with a mobile number under Firstfold and with an email address under Fynix", () => {
    expect(BRANDS.firstfold.signUpWith).toBe("phone");
    expect(BRANDS.fynix.signUpWith).toBe("email");
  });

  it("opens Fynix on a plan it sells", () => {
    expect(offersChoice(BRANDS.fynix, FYNIX_DEFAULT_CHOICE)).toBe(true);
  });
});

describe("brandText", () => {
  const lines = [
    "Your business is live on Firstfold Local.",
    "This is Firstfold's fee. You pay the ad platforms directly.",
    "Reset your Firstfold password",
    "Welcome to Firstfold.",
    "This business was taken off Firstfold Local, so it can't be changed here.",
    "No brand named here.",
    "Use a free firstfold.io address for now",
    "A Firstfold address, not yours to change",
    "Email us at support@firstfold.io and we’ll sort it out.",
  ];

  it("leaves a Firstfold line exactly as it was written", () => {
    for (const line of lines) expect(brandText(line, BRANDS.firstfold)).toBe(line);
  });

  it("says the directory neutrally and the product by its short name under Fynix", () => {
    expect(brandText(lines[0] ?? "", BRANDS.fynix)).toBe("Your business is live on the local directory.");
    expect(brandText(lines[1] ?? "", BRANDS.fynix)).toBe("This is Fynix Digital's fee. You pay the ad platforms directly.");
    expect(brandText(lines[2] ?? "", BRANDS.fynix)).toBe("Reset your Fynix password");
    expect(brandText(lines[3] ?? "", BRANDS.fynix)).toBe("Welcome to Fynix.");
    expect(brandText(lines[4] ?? "", BRANDS.fynix)).toBe("This business was taken off the local directory, so it can't be changed here.");
    expect(brandText(lines[5] ?? "", BRANDS.fynix)).toBe("No brand named here.");
    expect(brandText(lines[6] ?? "", BRANDS.fynix)).toBe("Use a free temporary address for now");
    expect(brandText(lines[7] ?? "", BRANDS.fynix)).toBe("A temporary address, not yours to change");
    expect(brandText(lines[8] ?? "", BRANDS.fynix)).toBe("Email us at hello@fynix.digital and we’ll sort it out.");
  });

  it("never leaves the word Firstfold in a line under Fynix", () => {
    for (const line of lines) expect(brandText(line, BRANDS.fynix)).not.toMatch(/first\s?fold/i);
  });
});

describe("brandedLabel", () => {
  it("keeps Firstfold's plan labels and drops the name from Fynix's", () => {
    expect(brandedLabel("Firstfold business listing", BRANDS.firstfold)).toBe("Firstfold business listing");
    expect(brandedLabel("Firstfold business listing", BRANDS.fynix)).toBe("Business listing");
    expect(brandedLabel("Firstfold business listing management", BRANDS.fynix)).toBe("Business listing management");
    expect(brandedLabel("10% off Firstfold digital marketing services", BRANDS.fynix)).toBe("10% off digital marketing services");
    expect(brandedLabel("Firstfold digital marketing services", BRANDS.fynix)).toBe("Digital marketing services");
    expect(brandedLabel("Images", BRANDS.fynix)).toBe("Images");
  });
});

describe("brandedPlanName", () => {
  it("keeps Firstfold's plan names and says them without Firstfold under Fynix", () => {
    expect(brandedPlanName("Firstfold Premium", BRANDS.firstfold)).toBe("Firstfold Premium");
    expect(brandedPlanName("Firstfold Premium", BRANDS.fynix)).toBe("Premium");
    expect(brandedPlanName("Firstfold Care", BRANDS.fynix)).toBe("Care");
    expect(brandedPlanName("Care plan", BRANDS.fynix)).toBe("Care plan");
  });
});

describe("isDirectoryOnlyPath", () => {
  it("is true for the pages that exist only for the directory listing, and anything under them", () => {
    for (const path of ["/business", "/deals", "/listing", "/advertise", "/reviews", "/leads", "/business/preview", "/deals/new"]) {
      expect(isDirectoryOnlyPath(path), path).toBe(true);
    }
  });

  it("is false for every other dashboard page, including ones whose name starts the same way", () => {
    for (const path of ["/", "/billing", "/upgrade", "/onboarding/business", "/listing-pictures/abc", "/leadsheet", "/support", "/content"]) {
      expect(isDirectoryOnlyPath(path), path).toBe(false);
    }
  });
});
