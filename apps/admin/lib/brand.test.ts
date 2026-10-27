import { describe, expect, it } from "vitest";
import { adminBrand } from "./brand";

describe("the staff console's brand", () => {
  it("is Brandbasket's: its name, its logo, no directory", () => {
    const brand = adminBrand();
    expect(brand).toMatchObject({ id: "brandbasket", name: "Brandbasket", staffLabel: "Brandbasket staff", sellsDirectory: false });
    expect(brand.logo).toMatchObject({ name: "Brandbasket", onLight: "/brand/brandbasket-logo-light.svg", onDark: "/brand/brandbasket-logo-dark.svg" });
    expect(brand.logo.siteUrl).toBe("https://brandbasket.in");
  });
});
