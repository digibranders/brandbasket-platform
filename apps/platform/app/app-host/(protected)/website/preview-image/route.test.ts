import { findPreviewImage, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { getAppDb } from "@/lib/server/db";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ findPreviewImage: vi.fn(), withTenantScope: vi.fn() }));
vi.mock("@/lib/server/customer-tenant", () => ({ getCustomerTenant: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn() }));

const tx = { name: "tx" } as never;
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" } as never;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue({} as never);
  vi.mocked(getCustomerTenant).mockResolvedValue(tenant);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(tx));
});

describe("GET /website/preview-image", () => {
  it("answers 401 with no session, and reads nothing", async () => {
    vi.mocked(getCustomerTenant).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(withTenantScope).not.toHaveBeenCalled();
  });

  it("answers 404 when the business has no picture, which is what another business's session sees", async () => {
    vi.mocked(findPreviewImage).mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(404);
    expect(withTenantScope).toHaveBeenCalledWith(expect.anything(), tenant, expect.any(Function));
  });

  it("serves the bytes as a private, immutable webp", async () => {
    const image = Buffer.from("webp-bytes");
    vi.mocked(findPreviewImage).mockResolvedValue({ previewUrl: "https://preview.example", image, capturedAt: new Date() });
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(response.headers.get("cache-control")).toBe("private, max-age=31536000, immutable");
    expect(response.headers.get("x-content-type-options")).toBe("nosniff");
    expect(Buffer.from(await response.arrayBuffer()).toString()).toBe("webp-bytes");
  });
});
