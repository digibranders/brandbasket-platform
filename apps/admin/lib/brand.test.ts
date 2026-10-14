import { describe, expect, it } from "vitest";
import { adminBrand } from "./brand";

describe("the staff console's brand", () => {
  it("is Fynix Digital's: its name, its logo, no directory", () => {
    const brand = adminBrand();
    expect(brand).toMatchObject({ id: "fynix", name: "Fynix Digital", staffLabel: "Fynix staff", sellsDirectory: false });
    expect(brand.logo).toMatchObject({ name: "Fynix Digital", white: "/brand/fynix-logo-white.svg", dark: "/brand/fynix-logo-dark.svg" });
    expect(brand.logo.siteUrl).toBe("https://fynix.digital");
  });
});
