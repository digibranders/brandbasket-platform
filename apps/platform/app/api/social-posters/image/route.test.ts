import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadActiveServices } from "@/lib/server/active-services";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { socialAiEnabled } from "@/lib/server/social-ai-flag";
import { fetchPosterImage, socialAutoSettings } from "@/lib/server/social-auto";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/customer-tenant", () => ({ getCustomerTenant: vi.fn() }));
vi.mock("@/lib/server/active-services", () => ({ loadActiveServices: vi.fn() }));
vi.mock("@/lib/server/social-ai-flag", () => ({ socialAiEnabled: vi.fn() }));
vi.mock("@/lib/server/social-auto", () => ({ socialAutoSettings: vi.fn(), fetchPosterImage: vi.fn() }));
vi.mock("@/lib/server/social-brand", () => ({ socialBrand: async (tenant: { businessId: string; businessName: string }) => ({ externalId: tenant.businessId, name: tenant.businessName, view: null }) }));

const get = (id: string | null): Promise<Response> => GET(new Request(`https://app.example/api/social-posters/image${id === null ? "" : `?id=${encodeURIComponent(id)}`}`));

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(getCustomerTenant).mockResolvedValue({ userId: "user-1", businessId: "business-1", businessName: "Om Sweets", role: "owner" } as never);
  vi.mocked(loadActiveServices).mockResolvedValue(["social"] as never);
  vi.mocked(socialAiEnabled).mockReturnValue(true);
  vi.mocked(socialAutoSettings).mockReturnValue({ baseUrl: "https://social.example", key: "key-1234567890abcdef", returnUrl: "https://app.example/social" });
  vi.mocked(fetchPosterImage).mockResolvedValue(new Uint8Array([0xff, 0xd8, 0xff, 0xd9]));
});

describe("GET /api/social-posters/image", () => {
  it("serves the picture of the signed-in customer's own business, privately", async () => {
    const response = await get("omsweets.0123abcd");
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(response.headers.get("Cache-Control")).toBe("private, max-age=300");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(fetchPosterImage).toHaveBeenCalledWith(expect.anything(), "business-1", "omsweets.0123abcd");
  });

  it("refuses an id that does not look like one, before asking anyone", async () => {
    for (const id of [null, "", "../secret", "a b", "x".repeat(200)]) expect((await get(id)).status).toBe(400);
    expect(getCustomerTenant).not.toHaveBeenCalled();
  });

  it("is 401 signed out, and 403 without the social service or while the AI side is off, and asks social-auto for nothing", async () => {
    vi.mocked(getCustomerTenant).mockResolvedValue(null);
    expect((await get("v1")).status).toBe(401);
    vi.mocked(getCustomerTenant).mockResolvedValue({ userId: "u", businessId: "b", businessName: "n", role: "owner" } as never);
    vi.mocked(loadActiveServices).mockResolvedValue([] as never);
    expect((await get("v1")).status).toBe(403);
    vi.mocked(loadActiveServices).mockResolvedValue(["social"] as never);
    vi.mocked(socialAiEnabled).mockReturnValue(false);
    expect((await get("v1")).status).toBe(403);
    expect(fetchPosterImage).not.toHaveBeenCalled();
  });

  it("is 404 for a picture that is not this business's, 503 when social-auto is not set up, and 502 when it cannot be reached", async () => {
    vi.mocked(fetchPosterImage).mockResolvedValue(null);
    expect((await get("v1")).status).toBe(404);
    vi.mocked(socialAutoSettings).mockReturnValue(null);
    expect((await get("v1")).status).toBe(503);
    vi.mocked(socialAutoSettings).mockReturnValue({ baseUrl: "https://social.example", key: "key-1234567890abcdef", returnUrl: "https://app.example/social" });
    vi.mocked(fetchPosterImage).mockRejectedValue(new Error("down"));
    expect((await get("v1")).status).toBe(502);
  });
});
