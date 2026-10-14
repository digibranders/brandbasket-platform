import { describe, expect, it } from "vitest";
import { ambientBrandShortName, clientBrandName, deploymentBrandName, deploymentBrandShortName, PRODUCT_NAME, PRODUCT_SHORT_NAME } from "./deployment-brand";

describe("the product's name", () => {
  it("is Fynix Digital in full and Fynix in short, wherever it is read", () => {
    expect(PRODUCT_NAME).toBe("Fynix Digital");
    expect(PRODUCT_SHORT_NAME).toBe("Fynix");
    expect(deploymentBrandName()).toBe("Fynix Digital");
    expect(clientBrandName()).toBe("Fynix Digital");
    expect(deploymentBrandShortName()).toBe("Fynix");
    expect(ambientBrandShortName()).toBe("Fynix");
  });
});
