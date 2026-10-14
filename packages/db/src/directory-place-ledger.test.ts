import { describe, expect, it } from "vitest";
import { isLedgerSourceRef } from "./directory-place-ledger";

describe("isLedgerSourceRef", () => {
  it("accepts the open datasets' refs", () => {
    expect(isLedgerSourceRef("overture:e41ed420-69eb-44ce-b9ab-6c458e58cea4")).toBe(true);
    expect(isLedgerSourceRef("osm:node/8261403277")).toBe(true);
  });

  it("accepts a Fynix survey ref", () => {
    expect(isLedgerSourceRef("survey:0x3be7b92181d5c545:0x2bdfd32ad6f69f08")).toBe(true);
  });

  it("refuses anything else", () => {
    for (const ref of ["", "survey:", "survey:abc", "google:0x1:0x2", "osm:", "overture:a b", "survey:0x1:0x2:0x3"]) {
      expect(isLedgerSourceRef(ref)).toBe(false);
    }
  });
});
