// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomer } from "@/lib/guards";
import { consumeUploadAllowance, storeBrandImage } from "@/lib/server-media/onboarding-media";
import { UPLOAD_VIEWER_MESSAGE } from "@/lib/server-media/route-guard";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/guards", () => ({ requireCustomer: vi.fn() }));
vi.mock("@/lib/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.brandbasket.in" }) }));
vi.mock("@brandbasket/shared/server/media-storage", () => ({ getMediaStorage: vi.fn(() => ({ kind: "storage" })) }));
vi.mock("@brandbasket/shared/server/media-upload", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/shared/server/media-upload")>()), hasDecodeCapacity: vi.fn(() => true) }));
vi.mock("@/lib/server-media/onboarding-media", () => ({ consumeUploadAllowance: vi.fn(), isOnboardingOpen: vi.fn(), storeBrandImage: vi.fn() }));

const tenant = { userId: "user-1", businessId: "business-1", businessName: "Cafe", role: "owner" };
const redirect = Object.assign(new Error("NEXT_REDIRECT"), { digest: "NEXT_REDIRECT;replace;/login;307;" });
const asset = { id: "a1", purpose: "photo", width: 10, height: 10, altText: null, originalFilename: "a.jpg" };

function upload(): Request {
  const body = new Uint8Array([1, 2, 3]);
  return new Request("https://app.brandbasket.in/api/brand-assets?purpose=photo", {
    method: "POST",
    headers: { host: "app.brandbasket.in", origin: "https://app.brandbasket.in", "content-length": String(body.byteLength), "content-type": "image/jpeg" },
    body,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomer).mockResolvedValue({ tenant, role: "owner" } as never);
  vi.mocked(consumeUploadAllowance).mockResolvedValue({ allowed: true });
  vi.mocked(storeBrandImage).mockResolvedValue({ ok: true, asset } as never);
});

describe("POST /api/brand-assets", () => {
  it("answers 401 where the guard redirects, and stores nothing", async () => {
    vi.mocked(requireCustomer).mockRejectedValue(redirect);
    const response = await POST(upload());
    expect(response.status).toBe(401);
    expect(storeBrandImage).not.toHaveBeenCalled();
  });

  it("answers 403 to a viewer, before any allowance is spent", async () => {
    vi.mocked(requireCustomer).mockResolvedValue({ tenant: { ...tenant, role: "viewer" }, role: "viewer" } as never);
    const response = await POST(upload());
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: UPLOAD_VIEWER_MESSAGE });
    expect(consumeUploadAllowance).not.toHaveBeenCalled();
    expect(storeBrandImage).not.toHaveBeenCalled();
  });

  it("stores the image for the session's business, with no onboarding to be open", async () => {
    const response = await POST(upload());
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ asset });
    expect(storeBrandImage).toHaveBeenCalledWith({ appDb: { kind: "app-db" }, storage: { kind: "storage" } }, tenant, "photo", expect.objectContaining({ bytes: new Uint8Array([1, 2, 3]) }));
  });
});
