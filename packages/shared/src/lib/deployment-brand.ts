/**
 * The product's name, in full and short: what emails, invoices and error screens call it. One product, one name; these
 * functions exist so that the screens and server code that need the name read it from one place.
 */
export const PRODUCT_NAME = "Brandbasket";
export const PRODUCT_SHORT_NAME = "Brandbasket";

/** The name emails, invoices and documents call the product: "Brandbasket". */
export function deploymentBrandName(): string {
  return PRODUCT_NAME;
}

/** The short form of the name, for a line of text that has the product's name in front of something: "Brandbasket". */
export function deploymentBrandShortName(): string {
  return PRODUCT_SHORT_NAME;
}

/** The name for a component that runs in the browser too (an error screen, the account bar): "Brandbasket". */
export function clientBrandName(): string {
  return PRODUCT_NAME;
}

/** The short name of the product for module-level values: "Brandbasket". */
export function ambientBrandShortName(): string {
  return PRODUCT_SHORT_NAME;
}
