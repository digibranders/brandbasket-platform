import { describe, expect, it } from "vitest";
import { parseReceiptSelection, receiptDownloadHref } from "./receipt-download";

const A = "0192f3c4-0000-7000-8000-00000000000a";
const B = "0192f3c4-0000-7000-8000-00000000000b";

describe("receiptDownloadHref", () => {
  it("links to every receipt, or to the ones picked", () => {
    expect(receiptDownloadHref(null)).toBe("/billing/receipts");
    expect(receiptDownloadHref([A, B])).toBe(`/billing/receipts?ids=${A}%2C${B}`);
  });
});

describe("parseReceiptSelection", () => {
  it("reads no ids as every receipt", () => {
    expect(parseReceiptSelection(null)).toEqual({ kind: "all" });
  });

  it("reads a comma-separated list of payment ids, once each", () => {
    expect(parseReceiptSelection(`${A},${B},${A}`)).toEqual({ kind: "some", ids: [A, B] });
  });

  it("round-trips the link it builds", () => {
    const href = receiptDownloadHref([A, B]);
    const ids = new URL(href, "http://app.localhost").searchParams.get("ids");
    expect(parseReceiptSelection(ids)).toEqual({ kind: "some", ids: [A, B] });
  });

  it("refuses anything that is not a list of UUIDs", () => {
    expect(parseReceiptSelection("")).toEqual({ kind: "invalid" });
    expect(parseReceiptSelection("not-a-uuid")).toEqual({ kind: "invalid" });
    expect(parseReceiptSelection(`${A},`)).toEqual({ kind: "invalid" });
    expect(parseReceiptSelection(Array.from({ length: 51 }, () => A).join(","))).toEqual({ kind: "invalid" });
  });
});
