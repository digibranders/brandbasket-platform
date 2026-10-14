import { describe, expect, it } from "vitest";
import { catalogWords } from "./catalog-words";

describe("catalogWords", () => {
  it("talks about services and products while the owner keeps the usual names", () => {
    expect(catalogWords("services", null)).toMatchObject({ tabName: "Services", addHeading: "Add a service", addSubmit: "Add service", nameField: "Service", one: "service", many: "services" });
    expect(catalogWords("products", null)).toMatchObject({ tabName: "Products", addHeading: "Add a product", saveSubmit: "Save product", nameField: "Product" });
  });

  it("follows the owner's own name once they chose one", () => {
    expect(catalogWords("services", "Menu")).toMatchObject({ tabName: "Menu", addHeading: "Add to Menu", addSubmit: "Add item", saveSubmit: "Save item", nameField: "Name", one: "item", many: "items" });
    expect(catalogWords("products", "Medicines").addHeading).toBe("Add to Medicines");
  });
});
