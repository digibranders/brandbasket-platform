import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@fynix/shared/lib/access";
import { handleProductPhotoRequest, type ProductPhotoRequestDeps } from "./product-photo-request";

vi.mock("server-only", () => ({}));

const APP_ORIGIN = "http://app.localhost:3000";
const APP_HOST = "app.localhost:3000";
const PRODUCT_ID = "0192f3c4-3333-7000-8000-000000000003";
const PHOTO_ID = "0192f3c4-4444-7000-8000-000000000004";

const tenant: TenantContext = {
  userId: "user-a",
  businessId: "0192f3c4-1111-7000-8000-000000000001",
  businessName: "Smile Dental",
  role: "owner",
};

function photoRequest(product: string | null = PRODUCT_ID, overrides: { readonly origin?: string } = {}): Request {
  const headers = new Headers({
    "content-type": "image/webp",
    host: APP_HOST,
    origin: overrides.origin ?? APP_ORIGIN,
    "content-length": "3",
  });
  const url = product === null ? `${APP_ORIGIN}/api/product-photos` : `${APP_ORIGIN}/api/product-photos?product=${product}`;
  return new Request(url, { method: "POST", headers, body: new Uint8Array([1, 2, 3]) });
}

let deps: {
  getTenant: ReturnType<typeof vi.fn<ProductPhotoRequestDeps["getTenant"]>>;
  appOrigin: string;
  canAddPhotos: ReturnType<typeof vi.fn<ProductPhotoRequestDeps["canAddPhotos"]>>;
  decodeBusy: ReturnType<typeof vi.fn<ProductPhotoRequestDeps["decodeBusy"]>>;
  consumeAllowance: ReturnType<typeof vi.fn<ProductPhotoRequestDeps["consumeAllowance"]>>;
  store: ReturnType<typeof vi.fn<ProductPhotoRequestDeps["store"]>>;
};

beforeEach(() => {
  deps = {
    getTenant: vi.fn<ProductPhotoRequestDeps["getTenant"]>().mockResolvedValue(tenant),
    appOrigin: APP_ORIGIN,
    canAddPhotos: vi.fn<ProductPhotoRequestDeps["canAddPhotos"]>().mockResolvedValue(true),
    decodeBusy: vi.fn<ProductPhotoRequestDeps["decodeBusy"]>().mockReturnValue(null),
    consumeAllowance: vi.fn<ProductPhotoRequestDeps["consumeAllowance"]>().mockResolvedValue({ allowed: true }),
    store: vi.fn<ProductPhotoRequestDeps["store"]>().mockResolvedValue({ ok: true, photoId: PHOTO_ID }),
  };
});

describe("POST /api/product-photos", () => {
  it("stores the photo for the product and answers 201 with its id", async () => {
    const response = await handleProductPhotoRequest(photoRequest(), deps);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ photoId: PHOTO_ID });
    expect(deps.store).toHaveBeenCalledWith(tenant, PRODUCT_ID, new Uint8Array([1, 2, 3]));
  });

  it("refuses a request from another origin before it looks at anything else", async () => {
    const response = await handleProductPhotoRequest(photoRequest(PRODUCT_ID, { origin: "http://evil.example" }), deps);
    expect(response.status).toBe(403);
    expect(deps.getTenant).not.toHaveBeenCalled();
  });

  it("asks for a product id, and anything else is a 400", async () => {
    expect((await handleProductPhotoRequest(photoRequest(null), deps)).status).toBe(400);
    expect((await handleProductPhotoRequest(photoRequest("not-an-id"), deps)).status).toBe(400);
    expect(deps.getTenant).not.toHaveBeenCalled();
  });

  it("answers 401 without a customer session", async () => {
    deps.getTenant.mockResolvedValue(null);
    expect((await handleProductPhotoRequest(photoRequest(), deps)).status).toBe(401);
    expect(deps.store).not.toHaveBeenCalled();
  });

  it("answers 409 when the business cannot have photos, before spending any of its upload budget", async () => {
    deps.canAddPhotos.mockResolvedValue(false);
    const response = await handleProductPhotoRequest(photoRequest(), deps);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "Pictures can't be added to this business. Email us and we'll sort it out." });
    expect(deps.consumeAllowance).not.toHaveBeenCalled();
    expect(deps.store).not.toHaveBeenCalled();
  });

  it("answers 503 with Retry-After when the server is too busy to decode, without spending the budget", async () => {
    deps.decodeBusy.mockReturnValue({ message: "Busy", retryAfterSeconds: 10 });
    const response = await handleProductPhotoRequest(photoRequest(), deps);
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(deps.consumeAllowance).not.toHaveBeenCalled();
  });

  it("answers 429 with Retry-After when the hourly budget is spent", async () => {
    deps.consumeAllowance.mockResolvedValue({ allowed: false, message: "Too many", retryAfterSeconds: 120 });
    const response = await handleProductPhotoRequest(photoRequest(), deps);
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("120");
    expect(deps.store).not.toHaveBeenCalled();
  });

  it("answers 404 for a product the business does not have", async () => {
    deps.store.mockResolvedValue({ ok: false, refusal: "not-found", message: "No such product" });
    const response = await handleProductPhotoRequest(photoRequest(), deps);
    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ error: "No such product" });
  });

  it("passes on the refusal of a file that is not an image", async () => {
    deps.store.mockResolvedValue({ ok: false, refusal: "unsupported-type", message: "Not an image" });
    const response = await handleProductPhotoRequest(photoRequest(), deps);
    expect(response.status).toBe(415);
  });
});
