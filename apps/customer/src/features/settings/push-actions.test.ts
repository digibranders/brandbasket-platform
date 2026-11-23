import { beforeEach, describe, expect, it, vi } from "vitest";
import { removePushDeviceAction, savePushDeviceAction } from "./push-actions";

const mocks = vi.hoisted(() => ({
  requireCustomer: vi.fn(),
  save: vi.fn(),
  revoke: vi.fn(),
  withUserScope: vi.fn(),
  report: vi.fn(),
}));

vi.mock("@brandbasket/db", () => ({ savePushSubscription: mocks.save, revokePushSubscription: mocks.revoke, withUserScope: mocks.withUserScope }));
vi.mock("next/headers", () => ({ headers: vi.fn(async () => new Headers({ "user-agent": "TestBrowser/1" })) }));
vi.mock("@/lib/guards", () => ({ requireCustomer: mocks.requireCustomer }));
vi.mock("@/lib/db", () => ({ getAppDb: () => ({ name: "app" }), getStaffDb: () => ({ name: "staff" }) }));
vi.mock("@/lib/report", () => ({ reportError: mocks.report }));

const SUBSCRIPTION = { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: "key", auth: "secret" } };

beforeEach(() => {
  vi.clearAllMocks();
  mocks.requireCustomer.mockResolvedValue({ user: { id: "session-user" }, tenant: { userId: "session-user", businessId: "b1" } });
  mocks.withUserScope.mockImplementation(async (_db: unknown, _user: string, work: (tx: unknown) => unknown) => work({ name: "tx" }));
});

describe("savePushDeviceAction", () => {
  it("saves the subscription for the signed-in person, whatever else the call carries", async () => {
    const result = await savePushDeviceAction({ ...SUBSCRIPTION, userId: "someone-else" } as never);
    expect(result).toEqual({ ok: true });
    expect(mocks.save).toHaveBeenCalledWith({ name: "staff" }, expect.objectContaining({ audience: "customer", userId: "session-user", endpoint: SUBSCRIPTION.endpoint, p256dh: "key", auth: "secret" }));
  });

  it("refuses an address that is not a push service, without touching the database", async () => {
    const result = await savePushDeviceAction({ ...SUBSCRIPTION, endpoint: "https://169.254.169.254/x" });
    expect(result.ok).toBe(false);
    expect(mocks.save).not.toHaveBeenCalled();
  });

  it("says so, and reports, when the save fails", async () => {
    mocks.save.mockRejectedValueOnce(new Error("db down"));
    const result = await savePushDeviceAction(SUBSCRIPTION);
    expect(result.ok).toBe(false);
    expect(mocks.report).toHaveBeenCalled();
  });
});

describe("removePushDeviceAction", () => {
  it("turns this browser off inside the person's own scope", async () => {
    mocks.revoke.mockResolvedValue(true);
    expect(await removePushDeviceAction({ endpoint: SUBSCRIPTION.endpoint })).toEqual({ ok: true });
    expect(mocks.withUserScope).toHaveBeenCalledWith({ name: "app" }, "session-user", expect.any(Function));
    expect(mocks.revoke).toHaveBeenCalledWith({ name: "tx" }, "session-user", SUBSCRIPTION.endpoint);
  });

  it("treats a browser that was already off as done", async () => {
    mocks.revoke.mockResolvedValue(false);
    expect(await removePushDeviceAction({ endpoint: SUBSCRIPTION.endpoint })).toEqual({ ok: true });
  });

  it("refuses a missing endpoint", async () => {
    expect((await removePushDeviceAction({ endpoint: "" })).ok).toBe(false);
  });
});
