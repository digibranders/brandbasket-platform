import { chargedAmountCents } from "@brandbasket/billing";
import { describe, expect, it, vi } from "vitest";
import { priceBases } from "./price-bases";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));

describe("priceBases", () => {
  it("measures a code against the cheapest service, since the plan row costs nothing", () => {
    expect(priceBases()).toEqual({
      USD: { netAmountCents: 6_500, taxRateBasisPoints: 0 },
      INR: { netAmountCents: 299_900, taxRateBasisPoints: 1_800 },
    });
  });

  it("gives the code form a price it can charge, so the summary under the discount cannot throw", () => {
    for (const basis of Object.values(priceBases())) {
      expect(() => chargedAmountCents(basis.netAmountCents, 0)).not.toThrow();
    }
  });
});
