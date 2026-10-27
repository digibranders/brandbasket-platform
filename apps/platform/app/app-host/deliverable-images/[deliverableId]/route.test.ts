import { findDeliverableForBusiness, withTenantScope } from "@brandbasket/db";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/customer-tenant", () => ({ getCustomerTenant: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("@brandbasket/shared/server/media-storage", () => ({ getMediaStorage: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/db")>()), findDeliverableForBusiness: vi.fn(), withTenantScope: vi.fn() }));

const ID = "0192f3c4-0000-7000-8000-00000000000a";
const tenant = { userId: "user-1", businessId: "business-1", businessName: "Cafe", role: "owner" };
const picture = { id: ID, imageKey: `deliverables/${ID}/display`, imageMime: "image/jpeg", imageSha256: "abc123" };
const BYTES = new Uint8Array([1, 2, 3]);

function call(id: string, headers: Record<string, string> = {}): Promise<Response> {
  return GET(new Request(`http://app.localhost/deliverable-images/${id}`, { headers }) as never, { params: Promise.resolve({ deliverableId: id }) } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getCustomerTenant).mockResolvedValue(tenant as never);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work({ kind: "tx" } as never));
  vi.mocked(findDeliverableForBusiness).mockResolvedValue(picture as never);
  vi.mocked(getMediaStorage).mockReturnValue({ get: vi.fn().mockResolvedValue({ bytes: Buffer.from(BYTES), contentType: "image/jpeg" }) } as never);
});

describe("GET /deliverable-images/[deliverableId] (app host)", () => {
  it("is a bare 401 for a visitor with no business, and reads nothing", async () => {
    vi.mocked(getCustomerTenant).mockResolvedValue(null);
    const response = await call(ID);
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.text()).toBe("");
    expect(findDeliverableForBusiness).not.toHaveBeenCalled();
  });

  it("is a bare 404 for an id that is not an id, and reads nothing", async () => {
    const response = await call("not-an-id");
    expect(response.status).toBe(404);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(findDeliverableForBusiness).not.toHaveBeenCalled();
  });

  it("is a 404 for another business's picture, which row-level security hides", async () => {
    vi.mocked(findDeliverableForBusiness).mockResolvedValue(null);
    const response = await call(ID);
    expect(response.status).toBe(404);
    expect(findDeliverableForBusiness).toHaveBeenCalledWith({ kind: "tx" }, "business-1", ID);
  });

  it("is a 404 for a deliverable with no picture", async () => {
    vi.mocked(findDeliverableForBusiness).mockResolvedValue({ ...picture, imageKey: null, imageMime: null, imageSha256: null } as never);
    expect((await call(ID)).status).toBe(404);
  });

  it("serves its own picture with the stored bytes and an ETag", async () => {
    const response = await call(ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe('"abc123"');
    expect(response.headers.get("Content-Type")).toBe("image/jpeg");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES);
  });

  it("answers 304 to a request that already holds this file", async () => {
    const response = await call(ID, { "if-none-match": '"abc123"' });
    expect(response.status).toBe(304);
  });
});
