// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerBilling } from "@/platform/lib/server/customer-access";
import { getCustomerTenant } from "@/platform/lib/server/customer-tenant";
import { consumeUploadAllowance } from "@/platform/lib/server/onboarding-media";
import { getBlogPayload } from "@/features/blog/server/payload";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/features/blog/server/payload", () => ({ getBlogPayload: vi.fn() }));
vi.mock("@/platform/lib/server/customer-access", () => ({ getCustomerBilling: vi.fn() }));
vi.mock("@/platform/lib/server/customer-tenant", () => ({ getCustomerTenant: vi.fn() }));
vi.mock("@/platform/lib/server/db", () => ({ getAppDb: vi.fn(() => ({})) }));
vi.mock("@/platform/lib/server/onboarding-media", () => ({ consumeUploadAllowance: vi.fn() }));
vi.mock("@/platform/lib/server/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.brandbasket.in" }) }));

const TENANT = { userId: "user-1", businessId: "business-1", businessName: "Smile Dental", role: "owner" } as const;

const PNG_BYTES = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13]);

function upload(bytes: Uint8Array<ArrayBuffer> = new TextEncoder().encode("abcd"), type = "image/png"): Request {
  return new Request("https://app.brandbasket.in/api/content-media-uploads", {
    method: "POST",
    headers: {
      host: "app.brandbasket.in",
      origin: "https://app.brandbasket.in",
      "content-length": String(bytes.byteLength),
      "content-type": type,
    },
    body: bytes,
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

describe("POST /api/content-media-uploads: roles", () => {
  it("refuses a viewer with 403 before billing is read or the body is touched", async () => {
    vi.mocked(getCustomerTenant).mockResolvedValue({ ...TENANT, role: "viewer" });
    const request = upload(PNG_BYTES);
    const response = await POST(request);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Only owners and editors can change this." });
    expect(request.bodyUsed).toBe(false);
    expect(getCustomerBilling).not.toHaveBeenCalled();
    expect(consumeUploadAllowance).not.toHaveBeenCalled();
  });
});

describe("POST /api/content-media-uploads: the file itself", () => {
  const create = vi.fn();

  beforeEach(() => {
    vi.mocked(getCustomerBilling).mockResolvedValue({ hasAccess: true, hasWebsite: true } as never);
    vi.mocked(consumeUploadAllowance).mockResolvedValue({ allowed: true });
    create.mockResolvedValue({ id: 5 });
    vi.mocked(getBlogPayload).mockResolvedValue({ create } as never);
  });

  it("refuses a file whose bytes are not an image, whatever it declares", async () => {
    const response = await POST(upload());
    expect(response.status).toBe(415);
    expect(create).not.toHaveBeenCalled();
  });

  it("stores the detected type, not the declared one", async () => {
    const response = await POST(upload(PNG_BYTES, "image/jpeg"));
    expect(response.status).toBe(201);
    expect(create.mock.calls[0]?.[0].file.mimetype).toBe("image/png");
  });

  it("spends the hourly budget before reading the body and answers 429 when it is spent", async () => {
    vi.mocked(consumeUploadAllowance).mockResolvedValue({ allowed: false, retryAfterSeconds: 120, message: "Too many." });
    const request = upload(PNG_BYTES);
    const response = await POST(request);
    expect(response.status).toBe(429);
    expect(response.headers.get("retry-after")).toBe("120");
    expect(request.bodyUsed).toBe(false);
    expect(create).not.toHaveBeenCalled();
  });
});
