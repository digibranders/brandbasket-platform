import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerBilling } from "@/lib/server/customer-access";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("payload", () => ({ getPayload: vi.fn() }));
vi.mock("@/payload.config", () => ({ default: {} }));
vi.mock("@/lib/server/customer-access", () => ({ getCustomerBilling: vi.fn() }));
vi.mock("@/lib/server/customer-tenant", () => ({ getCustomerTenant: vi.fn() }));
vi.mock("@/lib/server/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.brandbasket.in" }) }));

const TENANT = { userId: "user-1", businessId: "business-1", businessName: "Smile Dental", role: "owner" } as const;

function upload(): Request {
  return new Request("https://app.brandbasket.in/api/content-media-uploads", {
    method: "POST",
    headers: {
      host: "app.brandbasket.in",
      origin: "https://app.brandbasket.in",
      "content-length": "4",
      "content-type": "image/png",
    },
    body: "abcd",
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCustomerTenant).mockResolvedValue(TENANT);
});

describe("POST /api/content-media-uploads: the gate in front of the upload", () => {
  it("refuses a paid client without the Managed Website service", async () => {
    vi.mocked(getCustomerBilling).mockResolvedValue({ hasAccess: true, hasWebsite: false } as never);
    expect((await POST(upload())).status).toBe(402);
  });

  it("refuses a business whose plan is not paid", async () => {
    vi.mocked(getCustomerBilling).mockResolvedValue({ hasAccess: false, hasWebsite: false } as never);
    expect((await POST(upload())).status).toBe(402);
  });
});
