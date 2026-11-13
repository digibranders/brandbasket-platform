import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TenantContext } from "@brandbasket/shared/lib/access";
import { handleSocialPictureRequest, type SocialPictureDeps } from "./social-picture-request";
import { SocialAutoError } from "./social-auto";

vi.mock("server-only", () => ({}));

const APP_ORIGIN = "http://app.localhost:3000";
const APP_HOST = "app.localhost:3000";
const JPEG: Uint8Array<ArrayBuffer> = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3]);
const tenant: TenantContext = { userId: "user-a", businessId: "business-1", businessName: "Om Sweets", role: "owner" };

function request(overrides: { readonly origin?: string; readonly body?: Uint8Array<ArrayBuffer> } = {}): Request {
  const body = overrides.body ?? JPEG;
  return new Request(`${APP_ORIGIN}/api/social-posts/picture`, {
    method: "POST",
    headers: new Headers({ "content-type": "image/jpeg", host: APP_HOST, origin: overrides.origin ?? APP_ORIGIN, "content-length": String(body.length) }),
    body,
  });
}

let deps: {
  getTenant: ReturnType<typeof vi.fn<SocialPictureDeps["getTenant"]>>;
  appOrigin: string;
  hasSocial: ReturnType<typeof vi.fn<SocialPictureDeps["hasSocial"]>>;
  store: ReturnType<typeof vi.fn<SocialPictureDeps["store"]>>;
};

beforeEach(() => {
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  deps = {
    getTenant: vi.fn<SocialPictureDeps["getTenant"]>().mockResolvedValue(tenant),
    appOrigin: APP_ORIGIN,
    hasSocial: vi.fn<SocialPictureDeps["hasSocial"]>().mockResolvedValue(true),
    store: vi.fn<SocialPictureDeps["store"]>().mockResolvedValue("a".repeat(32)),
  };
});

describe("POST /api/social-posts/picture", () => {
  it("keeps the picture in social-auto and answers 201 with its id", async () => {
    const response = await handleSocialPictureRequest(request(), deps);
    expect(response.status).toBe(201);
    expect(await response.json()).toEqual({ pictureId: "a".repeat(32) });
    expect(deps.store).toHaveBeenCalledWith(JPEG);
    expect(response.headers.get("cache-control")).toBe("no-store");
  });

  it("refuses a request from another origin before it looks at anything else", async () => {
    const response = await handleSocialPictureRequest(request({ origin: "http://evil.example" }), deps);
    expect(response.status).toBe(403);
    expect(deps.getTenant).not.toHaveBeenCalled();
  });

  it("refuses a visitor who is signed out, and a business without the service", async () => {
    deps.getTenant.mockResolvedValue(null);
    expect((await handleSocialPictureRequest(request(), deps)).status).toBe(401);
    deps.getTenant.mockResolvedValue(tenant);
    deps.hasSocial.mockResolvedValue(false);
    expect((await handleSocialPictureRequest(request(), deps)).status).toBe(403);
    expect(deps.store).not.toHaveBeenCalled();
  });

  it("refuses a viewer with 403 before reading the body", async () => {
    deps.getTenant.mockResolvedValue({ ...tenant, role: "viewer" });
    const req = request();
    const response = await handleSocialPictureRequest(req, deps);
    expect(response.status).toBe(403);
    expect(await response.json()).toEqual({ error: "Only owners and editors can change this." });
    expect(req.bodyUsed).toBe(false);
    expect(deps.hasSocial).not.toHaveBeenCalled();
    expect(deps.store).not.toHaveBeenCalled();
  });

  it("refuses bytes that are not a JPG, and a body over 4 MB", async () => {
    expect((await handleSocialPictureRequest(request({ body: new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]) }), deps)).status).toBe(415);
    const big = new Uint8Array(4 * 1024 * 1024 + 1);
    big.set([0xff, 0xd8, 0xff]);
    expect((await handleSocialPictureRequest(request({ body: big }), deps)).status).toBe(413);
    expect(deps.store).not.toHaveBeenCalled();
  });

  it("passes on what social-auto refuses in its own words, and says nothing of other faults", async () => {
    deps.store.mockRejectedValue(new SocialAutoError("social-auto refused the picture (400)", 400, "picture must be square"));
    const refused = await handleSocialPictureRequest(request(), deps);
    expect(refused.status).toBe(422);
    expect(await refused.json()).toEqual({ error: "picture must be square" });

    deps.store.mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:4020"));
    const down = await handleSocialPictureRequest(request(), deps);
    expect(down.status).toBe(502);
    expect(JSON.stringify(await down.json())).not.toContain("ECONNREFUSED");
  });

  it("says posting is not available when social-auto is not set up here", async () => {
    deps.store.mockResolvedValue(null);
    expect((await handleSocialPictureRequest(request(), deps)).status).toBe(503);
  });
});
