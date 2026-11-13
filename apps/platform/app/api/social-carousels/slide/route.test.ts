import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadActiveServices } from "@/lib/server/active-services";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { fetchCarouselSlide, socialAutoSettings } from "@/lib/server/social-auto";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/customer-tenant", () => ({ getCustomerTenant: vi.fn() }));
vi.mock("@/lib/server/active-services", () => ({ loadActiveServices: vi.fn() }));
vi.mock("@/lib/server/social-auto", () => ({ socialAutoSettings: vi.fn(), fetchCarouselSlide: vi.fn() }));
vi.mock("@/lib/server/social-brand", () => ({ socialBrand: async (tenant: { businessId: string; businessName: string }) => ({ externalId: tenant.businessId, name: tenant.businessName, view: null }) }));

const get = (id: string | null, slide: string | null = "1"): Promise<Response> => {
  const query = new URLSearchParams();
  if (id !== null) query.set("id", id);
  if (slide !== null) query.set("slide", slide);
  return GET(new Request(`https://app.example/api/social-carousels/slide?${query}`));
};

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(getCustomerTenant).mockResolvedValue({ userId: "user-1", businessId: "business-1", businessName: "Om Sweets", role: "owner" } as never);
  vi.mocked(loadActiveServices).mockResolvedValue(["social"] as never);
  vi.mocked(socialAutoSettings).mockReturnValue({ baseUrl: "https://social.example", key: "key-1234567890abcdef", returnUrl: "https://app.example/social" });
  vi.mocked(fetchCarouselSlide).mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
});

describe("GET /api/social-carousels/slide", () => {
  it("serves the slide of the signed-in customer's own business, privately", async () => {
    const response = await get("carousel-1.0123", "2");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(fetchCarouselSlide).toHaveBeenCalledWith(expect.anything(), "business-1", "carousel-1.0123", 2);
  });

  it("refuses an id or a slide number that does not look right, before asking anyone", async () => {
    for (const id of [null, "", "../secret", "a b", "x".repeat(200)]) expect((await get(id)).status).toBe(400);
    for (const slide of [null, "", "0", "11", "1.5", "-1", "abc"]) expect((await get("c1", slide)).status).toBe(400);
    expect(getCustomerTenant).not.toHaveBeenCalled();
  });

  it("is 401 signed out and 403 without the social service, and asks social-auto for nothing", async () => {
    vi.mocked(getCustomerTenant).mockResolvedValue(null);
    expect((await get("c1")).status).toBe(401);
    vi.mocked(getCustomerTenant).mockResolvedValue({ userId: "u", businessId: "b", businessName: "n", role: "owner" } as never);
    vi.mocked(loadActiveServices).mockResolvedValue([] as never);
    expect((await get("c1")).status).toBe(403);
    expect(fetchCarouselSlide).not.toHaveBeenCalled();
  });

  it("is 404 for a slide that is not this business's, 503 when social-auto is not set up, and 502 when it cannot be reached", async () => {
    vi.mocked(fetchCarouselSlide).mockResolvedValue(null);
    expect((await get("c1")).status).toBe(404);
    vi.mocked(socialAutoSettings).mockReturnValue(null);
    expect((await get("c1")).status).toBe(503);
    vi.mocked(socialAutoSettings).mockReturnValue({ baseUrl: "https://social.example", key: "key-1234567890abcdef", returnUrl: "https://app.example/social" });
    vi.mocked(fetchCarouselSlide).mockRejectedValue(new Error("down"));
    expect((await get("c1")).status).toBe(502);
  });
});
