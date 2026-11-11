import { beforeEach, describe, expect, it, vi } from "vitest";
import { accountExportResponse } from "./export-download";

const mocks = vi.hoisted(() => ({ session: vi.fn(), limit: vi.fn(), memberships: vi.fn(), build: vi.fn() }));
vi.mock("@/lib/session", () => ({ getSessionUser: mocks.session }));
vi.mock("@/lib/db", () => ({ getAppDb: () => ({ name: "app" }), getStaffDb: () => ({ name: "staff" }) }));
vi.mock("@brandbasket/db", () => ({ consumeRateLimit: mocks.limit, listMembershipsForUser: mocks.memberships }));
vi.mock("./account-export", async () => ({
  buildAccountExport: mocks.build,
  accountExportFilename: (await vi.importActual<typeof import("./account-export")>("./account-export")).accountExportFilename,
}));

const NOW = new Date("2026-11-03T08:00:00.000Z");
const BUSINESS = "0198f2c0-0000-7000-8000-000000000001";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.mockResolvedValue({ id: "user-1", email: "a@example.com", name: "A", emailConfirmed: true, phone: null });
  mocks.limit.mockResolvedValue({ allowed: true, remaining: 5, retryAfterSeconds: 0 });
  mocks.memberships.mockResolvedValue([{ businessId: BUSINESS, businessName: "Apex", role: "owner" }]);
  mocks.build.mockResolvedValue({ format: "brandbasket-account-export/1" });
});

describe("accountExportResponse", () => {
  it("answers a bare 401 to someone signed out and reads nothing", async () => {
    mocks.session.mockResolvedValue(null);
    const response = await accountExportResponse(NOW);
    expect(response.status).toBe(401);
    expect(await response.text()).toBe("");
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(mocks.limit).not.toHaveBeenCalled();
    expect(mocks.build).not.toHaveBeenCalled();
  });

  it("serves the file as a dated download that is never cached", async () => {
    const response = await accountExportResponse(NOW);
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("application/json; charset=utf-8");
    expect(response.headers.get("Content-Disposition")).toBe('attachment; filename="brandbasket-my-data-2026-11-03.json"');
    expect(response.headers.get("Cache-Control")).toBe("private, no-store");
    expect(JSON.parse(await response.text())).toEqual({ format: "brandbasket-account-export/1" });
  });

  it("builds the file for the session's user and, for an owner, the business of their own membership", async () => {
    await accountExportResponse(NOW);
    expect(mocks.build).toHaveBeenCalledWith({ app: { name: "app" }, staff: { name: "staff" } }, { userId: "user-1", businessId: BUSINESS, now: NOW });
    expect(mocks.memberships).toHaveBeenCalledWith({ name: "app" }, "user-1");
  });

  it("leaves the business's records out for an editor, a viewer, and a person with no business", async () => {
    for (const memberships of [[{ businessId: BUSINESS, businessName: "Apex", role: "editor" }], [{ businessId: BUSINESS, businessName: "Apex", role: "viewer" }], []]) {
      mocks.build.mockClear();
      mocks.memberships.mockResolvedValue(memberships);
      expect((await accountExportResponse(NOW)).status).toBe(200);
      expect(mocks.build).toHaveBeenCalledWith(expect.anything(), { userId: "user-1", businessId: null, now: NOW });
    }
  });

  it("serves an account that has asked to be deleted: it never looks at a closure, so the old 401 is gone", async () => {
    // The route asks the session and the membership only. An account with an open closure is still signed in and still a member.
    const response = await accountExportResponse(NOW);
    expect(response.status).toBe(200);
    expect(mocks.build).toHaveBeenCalledOnce();
  });

  it("allows six downloads an hour per person and then answers 429 with when to come back", async () => {
    expect(await accountExportResponse(NOW)).toBeInstanceOf(Response);
    expect(mocks.limit).toHaveBeenCalledWith({ name: "app" }, "account-export:user:user-1", { limit: 6, windowSeconds: 3600 }, NOW);
    mocks.limit.mockResolvedValue({ allowed: false, remaining: 0, retryAfterSeconds: 1200 });
    mocks.build.mockClear();
    const refused = await accountExportResponse(NOW);
    expect(refused.status).toBe(429);
    expect(refused.headers.get("Retry-After")).toBe("1200");
    expect(mocks.build).not.toHaveBeenCalled();
  });
});
