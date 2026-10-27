import { findDeliverableForStaff } from "@brandbasket/db";
import { getMediaStorage } from "@brandbasket/shared/server/media-storage";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffAccess } from "@/lib/server/staff-access";
import { GET } from "./route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/staff-access", () => ({ getStaffAccess: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ kind: "staff-db" }) }));
vi.mock("@brandbasket/shared/server/media-storage", () => ({ getMediaStorage: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/db")>()), findDeliverableForStaff: vi.fn() }));

const ID = "0192f3c4-0000-7000-8000-00000000000a";
const picture = { id: ID, imageKey: `deliverables/${ID}/display`, imageMime: "image/jpeg", imageSha256: "abc123" };
const BYTES = new Uint8Array([1, 2, 3]);

function call(id: string, headers: Record<string, string> = {}): Promise<Response> {
  return GET(new Request(`http://admin.localhost/deliverable-images/${id}`, { headers }) as never, { params: Promise.resolve({ deliverableId: id }) } as never);
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getStaffAccess).mockResolvedValue({ kind: "granted" } as never);
  vi.mocked(findDeliverableForStaff).mockResolvedValue(picture as never);
  vi.mocked(getMediaStorage).mockReturnValue({ get: vi.fn().mockResolvedValue({ bytes: Buffer.from(BYTES), contentType: "image/jpeg" }) } as never);
});

describe("GET /deliverable-images/[deliverableId] (console)", () => {
  it("is a bare 401 unless staff access is granted, and reads nothing", async () => {
    vi.mocked(getStaffAccess).mockResolvedValue({ kind: "unauthenticated" } as never);
    const response = await call(ID);
    expect(response.status).toBe(401);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(findDeliverableForStaff).not.toHaveBeenCalled();
  });

  it("is a bare 404 for an id that is not an id, and reads nothing", async () => {
    expect((await call("not-an-id")).status).toBe(404);
    expect(findDeliverableForStaff).not.toHaveBeenCalled();
  });

  it("is a 404 for an unknown id and for a deliverable with no picture", async () => {
    vi.mocked(findDeliverableForStaff).mockResolvedValue(null);
    expect((await call(ID)).status).toBe(404);
    vi.mocked(findDeliverableForStaff).mockResolvedValue({ ...picture, imageKey: null, imageMime: null, imageSha256: null } as never);
    expect((await call(ID)).status).toBe(404);
  });

  it("serves the stored bytes with an ETag, and 304 to a request that holds them", async () => {
    const response = await call(ID);
    expect(response.status).toBe(200);
    expect(response.headers.get("ETag")).toBe('"abc123"');
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(BYTES);
    expect((await call(ID, { "if-none-match": '"abc123"' })).status).toBe(304);
  });
});
