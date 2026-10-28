import { findSetupCallBooking, recordSetupCallBooking, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { announceCallBooked } from "./call-alert";
import { bookCallSlot, cancelCallBooking } from "./call-scheduling";
import { bookSetupCall } from "./setup-call";
import { getSetupCallUrl } from "./setup-call-link";

vi.mock("server-only", () => ({}));
vi.mock("react", async (importOriginal) => ({ ...(await importOriginal<typeof import("react")>()), cache: <T>(fn: T): T => fn }));
vi.mock("./db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("./setup-call-link", () => ({ getSetupCallUrl: vi.fn() }));
vi.mock("./call-alert", () => ({ announceCallBooked: vi.fn() }));
vi.mock("./call-scheduling", async (importOriginal) => ({ ...(await importOriginal<typeof import("./call-scheduling")>()), bookCallSlot: vi.fn(), cancelCallBooking: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  withTenantScope: vi.fn(),
  findSetupCallBooking: vi.fn(),
  recordSetupCallBooking: vi.fn(),
}));

const tenant = { userId: "user-1", businessId: "business-1", businessName: "Cafe", role: "owner" } as never;
const invitee = { name: "Asha Rao", email: "asha@example.com" };
const NOW = new Date("2026-10-28T06:00:00.000Z");
const START = "2026-10-29T10:00:00.000Z";
const END = "2026-10-29T10:30:00.000Z";

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(withTenantScope).mockImplementation(((_db: unknown, _tenant: unknown, work: (t: unknown) => unknown) => work({ kind: "tx" })) as never);
  vi.mocked(getSetupCallUrl).mockResolvedValue("https://cal.com/steve-brandbasket/30min");
  vi.mocked(findSetupCallBooking).mockResolvedValue(null);
  vi.mocked(cancelCallBooking).mockResolvedValue(undefined);
  vi.mocked(bookCallSlot).mockResolvedValue({
    ok: true,
    call: { startsAt: new Date(START), endsAt: new Date(END), inviteeUri: "https://api.cal.com/v2/bookings/new", meetingUrl: "https://app.cal.com/video/new" },
  });
});

describe("bookSetupCall and the Teams alert", () => {
  it("tells Teams about a first kickoff booking, with its meeting link", async () => {
    const result = await bookSetupCall(tenant, invitee, START, "Asia/Kolkata", NOW);
    expect(result).toEqual({ ok: true, startsAtIso: START, endsAtIso: END });
    expect(recordSetupCallBooking).toHaveBeenCalled();
    expect(announceCallBooked).toHaveBeenCalledWith({
      tenant,
      kind: "kickoff",
      startsAt: new Date(START),
      endsAt: new Date(END),
      replaced: null,
      meetingUrl: "https://app.cal.com/video/new",
    });
  });

  it("says a kickoff moved from a time still ahead replaced that time", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue({
      startsAt: new Date("2026-10-30T10:00:00.000Z"),
      endsAt: new Date("2026-10-30T10:30:00.000Z"),
      inviteeUri: "https://api.cal.com/v2/bookings/old",
    } as never);
    await bookSetupCall(tenant, invitee, START, "Asia/Kolkata", NOW);
    expect(announceCallBooked).toHaveBeenCalledWith(
      expect.objectContaining({ replaced: { startsAt: new Date("2026-10-30T10:00:00.000Z"), endsAt: new Date("2026-10-30T10:30:00.000Z") } }),
    );
  });

  it("tells Teams nothing when the time was taken", async () => {
    vi.mocked(bookCallSlot).mockResolvedValue({ ok: false, reason: "taken" });
    await bookSetupCall(tenant, invitee, START, "Asia/Kolkata", NOW);
    expect(announceCallBooked).not.toHaveBeenCalled();
  });
});
