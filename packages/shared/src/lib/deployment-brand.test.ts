import { describe, expect, it } from "vitest";
import { ambientBrandShortName, clientBrandName, deploymentBrandName, deploymentBrandShortName, PRODUCT_NAME, PRODUCT_SHORT_NAME } from "./deployment-brand";

describe("the product's name", () => {
  it("is Brandbasket in full and Brandbasket in short, wherever it is read", () => {
    expect(PRODUCT_NAME).toBe("Brandbasket");
    expect(PRODUCT_SHORT_NAME).toBe("Brandbasket");
    expect(deploymentBrandName()).toBe("Brandbasket");
    expect(clientBrandName()).toBe("Brandbasket");
    expect(deploymentBrandShortName()).toBe("Brandbasket");
    expect(ambientBrandShortName()).toBe("Brandbasket");
  });
});
