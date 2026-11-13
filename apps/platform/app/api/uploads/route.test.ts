import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { consumeUploadAllowance } from "@/lib/server/onboarding-media";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/customer-tenant", () => ({ getCustomerTenant: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({})) }));
vi.mock("@/lib/server/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.brandbasket.in" }) }));
vi.mock("@brandbasket/shared/server/media-storage", () => ({ getMediaStorage: vi.fn() }));
vi.mock("@/lib/server/onboarding-media", () => ({
  consumeUploadAllowance: vi.fn(),
  isOnboardingOpen: vi.fn(),
  storeOnboardingImage: vi.fn(),
  storeBrandImage: vi.fn(),
}));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("POST /api/uploads", () => {
  it("refuses a viewer with 403 before spending budget or reading the body", async () => {
    vi.mocked(getCustomerTenant).mockResolvedValue({ userId: "user-1", businessId: "business-1", businessName: "Smile Dental", role: "viewer" });
    const request = new Request("https://app.brandbasket.in/api/uploads?purpose=photo", {
      method: "POST",
      headers: { host: "app.brandbasket.in", origin: "https://app.brandbasket.in", "content-length": "3", "content-type": "image/png" },
      body: new Uint8Array([1, 2, 3]),
    });
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Only owners and editors can change this." });
    expect(request.bodyUsed).toBe(false);
    expect(consumeUploadAllowance).not.toHaveBeenCalled();
  });
});
