import { describe, expect, it } from "vitest";
import { splitInvoiceNumber } from "./invoice-title";

describe("splitInvoiceNumber", () => {
  it("sets the invoice number apart from the words around it, so only the number is kept on one line", () => {
    expect(splitInvoiceNumber("Tax invoice FY/26-27/000001")).toEqual([
      { text: "Tax invoice ", nowrap: false },
      { text: "FY/26-27/000001", nowrap: true },
    ]);
  });

  it("finds a number in the middle of a title", () => {
    expect(splitInvoiceNumber("Tax invoice FY/27-28/012345 (paid)")).toEqual([
      { text: "Tax invoice ", nowrap: false },
      { text: "FY/27-28/012345", nowrap: true },
      { text: " (paid)", nowrap: false },
    ]);
  });

  it("returns a receipt title as it is", () => {
    expect(splitInvoiceNumber("Receipt 7, 12 Sep 2026")).toEqual([{ text: "Receipt 7, 12 Sep 2026", nowrap: false }]);
  });

  it("returns nothing for an empty title", () => {
    expect(splitInvoiceNumber("")).toEqual([]);
  });

  it("keeps the whole title when the parts are joined", () => {
    const title = "Tax invoice FY/26-27/000001";
    expect(splitInvoiceNumber(title).map((part) => part.text).join("")).toBe(title);
  });
});
