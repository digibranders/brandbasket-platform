import { beforeEach, describe, expect, it, vi } from "vitest";
import { getCustomerTenant } from "@/lib/server/customer-tenant";
import { servePayloadMediaFile } from "@/lib/server/payload-media-serving";
import { getStaffAccess } from "@/lib/server/staff-access";
import { GET } from "./route";

/*
 * This route is now a thin access gate in front of `servePayloadMediaFile` (lib/server/payload-media-serving.ts),
 * which does the real per-business authorization and byte-serving — see that file's own test for coverage of the
 * businessId check itself. What belongs here is just: who gets past the gate at all, and with which scope.
 */
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/customer-tenant", () => ({ getCustomerTenant: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ getStaffAccess: vi.fn() }));
vi.mock("@/lib/server/payload-media-serving", () => ({ servePayloadMediaFile: vi.fn() }));

const mockedGetCustomerTenant = vi.mocked(getCustomerTenant);
const mockedGetStaffAccess = vi.mocked(getStaffAccess);
const mockedServePayloadMediaFile = vi.mocked(servePayloadMediaFile);

const BUSINESS_A = "0192f3c4-aaaa-7000-8000-00000000000a";

function tenantFor(businessId: string) {
  return { userId: "user-1", businessId } as never;
}

function request(mediaId: string): [Request, { params: Promise<{ mediaId: string }> }] {
  return [new Request(`http://app.localhost/content-media/${mediaId}`), { params: Promise.resolve({ mediaId }) }];
}

beforeEach(() => {
  vi.clearAllMocks();
  mockedGetStaffAccess.mockResolvedValue({ kind: "unauthenticated" } as never);
  mockedServePayloadMediaFile.mockResolvedValue(new Response("bytes", { status: 200 }));
});

describe("GET /content-media/[mediaId] (app host)", () => {
  it("scopes a customer session to their own businessId", async () => {
    mockedGetCustomerTenant.mockResolvedValue(tenantFor(BUSINESS_A));

    const response = await GET(...request("5"));

    expect(response.status).toBe(200);
    expect(mockedServePayloadMediaFile).toHaveBeenCalledWith("5", BUSINESS_A);
  });

  it("passes a staff session through unscoped (null)", async () => {
    mockedGetCustomerTenant.mockResolvedValue(null);
    mockedGetStaffAccess.mockResolvedValue({ kind: "granted" } as never);

    const response = await GET(...request("5"));

    expect(response.status).toBe(200);
    expect(mockedServePayloadMediaFile).toHaveBeenCalledWith("5", null);
  });

  it("refuses anyone without a customer or staff session, without calling servePayloadMediaFile", async () => {
    mockedGetCustomerTenant.mockResolvedValue(null);

    const response = await GET(...request("5"));

    expect(response.status).toBe(401);
    expect(mockedServePayloadMediaFile).not.toHaveBeenCalled();
  });
});
