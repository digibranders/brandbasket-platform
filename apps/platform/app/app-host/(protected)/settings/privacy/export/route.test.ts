import { beforeEach, describe, expect, it, vi } from "vitest";
import { GET } from "./route";

const mocks = vi.hoisted(() => ({ session: vi.fn(), limit: vi.fn(), memberships: vi.fn(), build: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/session", () => ({ getSessionUser: mocks.session }));
vi.mock("@/lib/server/db", () => ({ getAppDb: () => ({ name: "app" }), getStaffDb: () => ({ name: "staff" }) }));
vi.mock("@brandbasket/db", () => ({ consumeRateLimit: mocks.limit, listMembershipsForUser: mocks.memberships }));
vi.mock("@/lib/server/account-export", () => ({ buildAccountExport: mocks.build, accountExportFilename: (day: string) => `my-data-${day}.json` }));

const BUSINESS = "0198f2c0-0000-7000-8000-000000000001";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ id: "user-1" });
  mocks.limit.mockResolvedValue({ allowed: true, remaining: 5, retryAfterSeconds: 0 });
  mocks.memberships.mockResolvedValue([{ businessId: BUSINESS, businessName: "Apex", role: "owner" }]);
  mocks.build.mockResolvedValue({ format: "x" });
});

describe("GET /settings/privacy/export", () => {
  it("answers a bare 401 to someone signed out and reads nothing", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await GET();
    expect(response.status).toBe(401);
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("serves the download for any signed-in session, which is all it reads, so an account that asked to be deleted still gets its copy", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.build).toHaveBeenCalledWith(expect.anything(), { userId: "user-1", businessId: BUSINESS, now: expect.any(Date) });
  });

  it("leaves the business's records out for an editor, a viewer and a person with no business", async () => {
    for (const memberships of [[{ businessId: BUSINESS, businessName: "Apex", role: "editor" }], [{ businessId: BUSINESS, businessName: "Apex", role: "viewer" }], []]) {
      mocks.build.mockClear();
      mocks.memberships.mockResolvedValue(memberships);
      expect((await GET()).status).toBe(200);
      expect(mocks.build).toHaveBeenCalledWith(expect.anything(), { userId: "user-1", businessId: null, now: expect.any(Date) });
    }
  });

  it("stays rate limited: 6 an hour per person, then 429 with when to come back", async () => {
    mocks.limit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 1200 });
    const response = await GET();
    expect(mocks.limit).toHaveBeenCalledWith({ name: "staff" }, "account-export:user:user-1", { limit: 6, windowSeconds: 3600 }, expect.any(Date));
    expect(response.status).toBe(429);
    expect(response.headers.get("Retry-After")).toBe("1200");
    expect(mocks.build).not.toHaveBeenCalled();
  });
});
