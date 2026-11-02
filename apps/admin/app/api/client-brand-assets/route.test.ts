import { beforeEach, describe, expect, it, vi } from "vitest";
import { recordStaffAction } from "@/lib/server/activity";
import { storeClientBrandImage } from "@/lib/server/client-brand-images";
import { getStaffAccess } from "@/lib/server/staff-access";
import { POST } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/env", () => ({ serverEnv: () => ({ ADMIN_ORIGIN: "https://console.brandbasket.in" }) }));
vi.mock("@/lib/server/staff-access", () => ({ getStaffAccess: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));
vi.mock("@/lib/server/client-brand-images", () => ({ storeClientBrandImage: vi.fn() }));
vi.mock("@brandbasket/shared/server/media-storage", () => ({ getMediaStorage: () => ({ name: "storage" }) }));
vi.mock("@brandbasket/shared/server/media-upload", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/shared/server/media-upload")>("@brandbasket/shared/server/media-upload");
  return { ...actual, hasDecodeCapacity: vi.fn(() => true) };
});

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const GRANTED = { kind: "granted", user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } };

function upload(overrides: { origin?: string | null; query?: string; headers?: Record<string, string>; body?: Uint8Array } = {}): Request {
  const body = overrides.body ?? new Uint8Array([1, 2, 3]);
  const headers = new Headers({ "content-length": String(body.byteLength), ...overrides.headers });
  if (overrides.origin !== null) headers.set("origin", overrides.origin ?? "https://console.brandbasket.in");
  return new Request(`https://console.brandbasket.in/api/client-brand-assets${overrides.query ?? `?businessId=${BUSINESS}&purpose=photo`}`, {
    method: "POST",
    headers,
    body: body as BodyInit,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffAccess).mockResolvedValue(GRANTED as never);
  vi.mocked(storeClientBrandImage).mockResolvedValue({ ok: true, mediaId: "media-1" });
});

describe("POST /api/client-brand-assets", () => {
  it.each([
    ["no Origin", { origin: null }],
    ["another site's Origin", { origin: "https://evil.example" }],
  ])("refuses a request with %s, before looking at anything else", async (_label, overrides) => {
    const response = await POST(upload(overrides));

    expect(response.status).toBe(403);
    expect(getStaffAccess).not.toHaveBeenCalled();
  });

  it("refuses a missing, malformed or oversized Content-Length", async () => {
    expect((await POST(upload({ headers: { "content-length": "" } }))).status).toBe(400);
    expect((await POST(upload({ headers: { "content-length": "99999999" } }))).status).toBe(413);
    const missing = upload();
    missing.headers.delete("content-length");
    expect((await POST(missing)).status).toBe(411);
  });

  it.each([
    ["a business id that is not a uuid", `?businessId=nope&purpose=photo`],
    ["no business", `?purpose=photo`],
    ["a purpose that is neither logo nor photo", `?businessId=${BUSINESS}&purpose=video`],
  ])("refuses %s", async (_label, query) => {
    expect((await POST(upload({ query }))).status).toBe(400);
    expect(storeClientBrandImage).not.toHaveBeenCalled();
  });

  it("answers 401 without a staff session, and stores nothing", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue({ kind: "anonymous" } as never);

    expect((await POST(upload())).status).toBe(401);
    expect(storeClientBrandImage).not.toHaveBeenCalled();
  });

  it("stores the image for the named business as the signed-in staff member, records it and answers 201", async () => {
    const response = await POST(upload({ headers: { "x-file-name": encodeURIComponent("front door.jpg") } }));

    expect(response.status).toBe(201);
    expect(storeClientBrandImage).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ businessId: BUSINESS, staffUserId: "staff-1", purpose: "photo", filename: "front door.jpg", bytes: new Uint8Array([1, 2, 3]) }),
    );
    expect(recordStaffAction).toHaveBeenCalledWith(GRANTED, expect.objectContaining({ businessId: BUSINESS, kind: "media.uploaded", data: { purpose: "photo", mediaId: "media-1" } }));
  });

  it("passes a refusal on with its status and Retry-After, and records nothing", async () => {
    vi.mocked(storeClientBrandImage).mockResolvedValue({ ok: false, status: 503, message: "Busy.", retryAfterSeconds: 10 });

    const response = await POST(upload());

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("10");
    expect(await response.json()).toEqual({ error: "Busy." });
    expect(recordStaffAction).not.toHaveBeenCalled();
  });
});
