import { beforeEach, describe, expect, it, vi } from "vitest";
import { removePushDeviceAction, savePushDeviceAction } from "./push-actions";

const mocks = vi.hoisted(() => ({ requireStaffAccess: vi.fn(), save: vi.fn(), revoke: vi.fn() }));

vi.mock("@brandbasket/db", () => ({ savePushSubscription: mocks.save, revokePushSubscription: mocks.revoke }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "user-agent": "TestBrowser/1" })) }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: mocks.requireStaffAccess }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff" }) }));

const SUBSCRIPTION = { endpoint: "https://updates.push.services.mozilla.com/wpush/v2/abc", keys: { p256dh: "key", auth: "secret" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireStaffAccess.mockResolvedValue({ user: { id: "staff-1" } });
});

describe("the console's push actions", () => {
  it("saves a staff subscription for the signed-in staff member", async () => {
    expect(await savePushDeviceAction({ ...SUBSCRIPTION, userId: "other" })).toEqual({ ok: true });
    expect(mocks.save).toHaveBeenCalledWith({ name: "staff" }, expect.objectContaining({ audience: "staff", userId: "staff-1", endpoint: SUBSCRIPTION.endpoint, userAgent: "TestBrowser/1" }));
  });

  it("refuses an address that is not a push service", async () => {
    expect((await savePushDeviceAction({ ...SUBSCRIPTION, endpoint: "https://localhost/x" })).ok).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("reports a failed save instead of throwing into the page", async () => {
    mocks.save.mockRejectedValueOnce(new Error("db down"));
    expect((await savePushDeviceAction(SUBSCRIPTION)).ok).toBe(false);
  });

  it("removes only the signed-in member's own browser", async () => {
    mocks.revoke.mockResolvedValue(true);
    expect(await removePushDeviceAction({ endpoint: SUBSCRIPTION.endpoint })).toEqual({ ok: true });
    expect(mocks.revoke).toHaveBeenCalledWith({ name: "staff" }, "staff-1", SUBSCRIPTION.endpoint);
    expect((await removePushDeviceAction({ endpoint: "" })).ok).toBe(false);
  });
});
