import { describe, expect, it } from "vitest";
import { adminBrand } from "./brand";

describe("the staff console's brand", () => {
  it("is Firstfold's, with its own wordmark, when no brand is set", () => {
    const brand = adminBrand({});
    expect(brand).toMatchObject({ id: "firstfold", name: "Firstfold", staffLabel: "Firstfold staff", logo: undefined, sellsDirectory: true });
  });

  it("is Fynix Digital's on a Fynix server: its name, its logo, no directory", () => {
    const brand = adminBrand({ PLATFORM_BRAND: "fynix" });
    expect(brand).toMatchObject({ id: "fynix", name: "Fynix Digital", staffLabel: "Fynix staff", sellsDirectory: false });
    expect(brand.logo).toMatchObject({ name: "Fynix Digital", white: "/brand/fynix-logo-white.svg", dark: "/brand/fynix-logo-dark.svg" });
    expect(brand.logo?.siteUrl).toBe("https://fynix.digital");
  });

  it("says nothing of Firstfold anywhere on a Fynix server", () => {
    expect(JSON.stringify(adminBrand({ PLATFORM_BRAND: "fynix" }))).not.toMatch(/first\s?fold/i);
  });

  it("refuses a brand it does not know", () => {
    expect(() => adminBrand({ PLATFORM_BRAND: "fynx" })).toThrow(/PLATFORM_BRAND/);
  });

  it("reads the browser's copy of the brand by default", () => {
    const before = process.env.NEXT_PUBLIC_PLATFORM_BRAND;
    process.env.NEXT_PUBLIC_PLATFORM_BRAND = "fynix";
    try {
      expect(adminBrand().id).toBe("fynix");
    } finally {
      if (before === undefined) delete process.env.NEXT_PUBLIC_PLATFORM_BRAND;
      else process.env.NEXT_PUBLIC_PLATFORM_BRAND = before;
    }
  });
});
