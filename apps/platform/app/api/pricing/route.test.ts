import { describe, expect, it } from "vitest";
import { publicPricing } from "@/lib/billing/public-prices";
import { GET } from "./route";

describe("GET /api/pricing", () => {
  it("answers with the services and packages, cached", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toContain("s-maxage=300");
    expect(await response.json()).toEqual(publicPricing());
  });
});
