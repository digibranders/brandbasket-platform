// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from "vitest";
import { alertCalcomChange } from "./calcom-alerts";
import { alertTeams } from "./teams";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: () => ({}) }));
vi.mock("./env", () => ({ serverEnv: () => ({ ADMIN_ORIGIN: "http://console.localhost:3199" }) }));
vi.mock("./teams", () => ({ alertTeams: vi.fn(async () => undefined) }));
const notify = vi.hoisted(() => vi.fn(async () => ({ failed: false })));
vi.mock("@brandbasket/shared/server/notify", () => ({ createDefaultNotifier: vi.fn(() => notify) }));

beforeEach(() => {
  vi.clearAllMocks();
});

describe("alertCalcomChange", () => {
  it("posts a card and a staff notice, both keyed by the delivery's event id", async () => {
    await alertCalcomChange({ what: "moved", startsAt: new Date("2026-12-02T08:30:00.000Z"), eventId: "body:abc" });

    const [destination, message, options] = vi.mocked(alertTeams).mock.calls[0] ?? [];
    expect(destination).toBe("customers");
    expect(JSON.stringify(message)).toContain("A call was moved on Cal.com");
    expect(JSON.stringify(message)).toContain("2 Dec 2026, 2:00 pm IST");
    expect(JSON.stringify(message)).toContain("http://console.localhost:3199/calls");
    expect(options).toEqual({ dedupeKey: "calcom:body:abc" });
    expect(notify).toHaveBeenCalledWith({
      event: "call.changed.staff",
      audience: { kind: "staff" },
      dedupeKey: "body:abc",
      data: { what: "moved", when: "2 Dec 2026, 2:00 pm IST" },
    });
  });

  it("leaves the time out for a cancellation, which has none", async () => {
    await alertCalcomChange({ what: "cancelled", eventId: "e1" });
    expect(notify).toHaveBeenCalledWith(expect.objectContaining({ data: { what: "cancelled", when: undefined } }));
  });

  it("never throws, even when the notifier does", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    notify.mockRejectedValueOnce(new Error("boom"));
    await expect(alertCalcomChange({ what: "booked", eventId: "e2" })).resolves.toBeUndefined();
    expect(log).toHaveBeenCalled();
    log.mockRestore();
  });
});
