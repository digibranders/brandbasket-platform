import { cancelTeamCall, findTeamCall, listTeamCalls, recordTeamCall, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookCallSlot, cancelCallBooking } from "./call-scheduling";
import { bookTeamCall, callsAreOpen, cancelTeamCallFor, loadBookCallOptions, loadCalls, loadNextCall } from "./calls";
import { loadSetupServices } from "./first-look";
import { getLiveWebsite, getProjectOverview } from "./onboarding";
import { getSetupCallState } from "./setup-call";
import { getSetupCallUrl } from "./setup-call-link";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("./db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("./onboarding", () => ({ getProjectOverview: vi.fn(), getLiveWebsite: vi.fn() }));
vi.mock("./first-look", () => ({ loadSetupServices: vi.fn() }));
vi.mock("./setup-call", () => ({ getSetupCallState: vi.fn() }));
vi.mock("./setup-call-link", () => ({ getSetupCallUrl: vi.fn() }));
vi.mock("./call-scheduling", async (importOriginal) => ({ ...(await importOriginal<typeof import("./call-scheduling")>()), bookCallSlot: vi.fn(), cancelCallBooking: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  withTenantScope: vi.fn(),
  listTeamCalls: vi.fn(),
  findTeamCall: vi.fn(),
  recordTeamCall: vi.fn(),
  cancelTeamCall: vi.fn(),
}));

const tenant = { userId: "user-1", businessId: "business-1", businessName: "Sai Dental Care", role: "owner" } as never;
const invitee = { name: "Priya Shah", email: "priya@example.com" };
const NOW = new Date("2026-12-01T06:30:00.000Z");
const START = "2026-12-02T08:30:00.000Z";
const BOOKING_URL = "https://cal.com/steve-brandbasket/30min";
const tx = { kind: "tx" };

function stored(overrides: Record<string, unknown> = {}): never {
  return {
    id: "call-1",
    businessId: "business-1",
    reason: "social",
    note: null,
    status: "booked",
    startsAt: new Date(START),
    endsAt: new Date("2026-12-02T09:00:00.000Z"),
    providerUri: "https://api.cal.com/v2/bookings/old",
    summary: null,
    ...overrides,
  } as never;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(withTenantScope).mockImplementation(((_db: unknown, _tenant: unknown, work: (t: unknown) => unknown) => work(tx)) as never);
  vi.mocked(getSetupCallUrl).mockResolvedValue(BOOKING_URL);
  vi.mocked(listTeamCalls).mockResolvedValue([]);
  vi.mocked(bookCallSlot).mockResolvedValue({
    ok: true,
    call: { startsAt: new Date(START), endsAt: new Date("2026-12-02T09:00:00.000Z"), inviteeUri: "https://api.cal.com/v2/bookings/new" },
  });
  vi.mocked(recordTeamCall).mockResolvedValue({ id: "call-2", created: true });
  vi.mocked(cancelTeamCall).mockResolvedValue(true);
  vi.mocked(cancelCallBooking).mockResolvedValue(undefined);
});

const input = (overrides: Record<string, unknown> = {}) => ({ startIso: START, timeZone: "Asia/Kolkata", reason: "social" as const, note: "Ads for braces", replaceId: null, ...overrides });

describe("bookTeamCall", () => {
  it("books the time with Cal.com, saying it is a call and why, and records it for the signed-in business", async () => {
    const result = await bookTeamCall(tenant, invitee, input(), NOW);
    expect(result).toEqual({ ok: true, startsAtIso: START, endsAtIso: "2026-12-02T09:00:00.000Z" });
    expect(bookCallSlot).toHaveBeenCalledWith(BOOKING_URL, START, {
      ...invitee,
      timeZone: "Asia/Kolkata",
      businessId: "business-1",
      purpose: "call",
      reason: "social",
      note: "Ads for braces",
    });
    expect(recordTeamCall).toHaveBeenCalledWith(tx, {
      businessId: "business-1",
      reason: "social",
      note: "Ads for braces",
      startsAt: new Date(START),
      endsAt: new Date("2026-12-02T09:00:00.000Z"),
      providerUri: "https://api.cal.com/v2/bookings/new",
    });
  });

  it("refuses a time that is not ahead, before booking anything", async () => {
    expect(await bookTeamCall(tenant, invitee, input({ startIso: "2026-11-30T08:30:00.000Z" }), NOW)).toEqual({ ok: false, reason: "failed" });
    expect(bookCallSlot).not.toHaveBeenCalled();
  });

  it("refuses a fourth call, before booking anything", async () => {
    const three = [1, 2, 3].map((n) => stored({ id: `call-${n}`, startsAt: new Date(`2026-12-0${n + 2}T08:30:00.000Z`), endsAt: new Date(`2026-12-0${n + 2}T09:00:00.000Z`) }));
    vi.mocked(listTeamCalls).mockResolvedValue(three);
    expect(await bookTeamCall(tenant, invitee, input(), NOW)).toEqual({ ok: false, reason: "limit" });
    expect(bookCallSlot).not.toHaveBeenCalled();
  });

  it("answers taken when the time went, and records nothing", async () => {
    vi.mocked(bookCallSlot).mockResolvedValue({ ok: false, reason: "taken" });
    expect(await bookTeamCall(tenant, invitee, input(), NOW)).toEqual({ ok: false, reason: "taken" });
    expect(recordTeamCall).not.toHaveBeenCalled();
  });

  it("answers failed when there is no booking link or no way to book here", async () => {
    vi.mocked(getSetupCallUrl).mockResolvedValue(null);
    expect(await bookTeamCall(tenant, invitee, input(), NOW)).toEqual({ ok: false, reason: "failed" });
    vi.mocked(getSetupCallUrl).mockResolvedValue(BOOKING_URL);
    vi.mocked(bookCallSlot).mockResolvedValue(null);
    expect(await bookTeamCall(tenant, invitee, input(), NOW)).toEqual({ ok: false, reason: "failed" });
  });

  it("cancels the booking it just made when it cannot record it, so Cal.com is not left holding a call the dashboard never shows", async () => {
    vi.mocked(recordTeamCall).mockRejectedValue(new Error("database down"));
    expect(await bookTeamCall(tenant, invitee, input(), NOW)).toEqual({ ok: false, reason: "failed" });
    expect(cancelCallBooking).toHaveBeenCalledWith(BOOKING_URL, "https://api.cal.com/v2/bookings/new");
  });

  describe("changing the time of a call", () => {
    it("books the new time first, then cancels the old booking and the old call", async () => {
      vi.mocked(listTeamCalls).mockResolvedValue([stored()]);
      const result = await bookTeamCall(tenant, invitee, input({ replaceId: "call-1", startIso: "2026-12-03T08:30:00.000Z" }), NOW);
      expect(result.ok).toBe(true);
      expect(vi.mocked(bookCallSlot).mock.invocationCallOrder[0]).toBeLessThan(vi.mocked(cancelCallBooking).mock.invocationCallOrder[0] ?? 0);
      expect(cancelCallBooking).toHaveBeenCalledWith(BOOKING_URL, "https://api.cal.com/v2/bookings/old");
      expect(cancelTeamCall).toHaveBeenCalledWith(tx, { id: "call-1", businessId: "business-1", now: NOW });
    });

    it("lets the customer change a call even when three are booked, because the old one goes", async () => {
      const three = [1, 2, 3].map((n) => stored({ id: `call-${n}`, startsAt: new Date(`2026-12-0${n + 2}T08:30:00.000Z`), endsAt: new Date(`2026-12-0${n + 2}T09:00:00.000Z`) }));
      vi.mocked(listTeamCalls).mockResolvedValue(three);
      expect((await bookTeamCall(tenant, invitee, input({ replaceId: "call-2" }), NOW)).ok).toBe(true);
    });

    it("refuses a call that is not this business's, is cancelled, or has started", async () => {
      vi.mocked(listTeamCalls).mockResolvedValue([stored({ id: "call-1", status: "cancelled" }), stored({ id: "call-3", startsAt: new Date("2026-12-01T06:00:00.000Z") })]);
      for (const replaceId of ["call-9", "call-1", "call-3"]) {
        expect(await bookTeamCall(tenant, invitee, input({ replaceId }), NOW)).toEqual({ ok: false, reason: "failed" });
      }
      expect(bookCallSlot).not.toHaveBeenCalled();
    });

    it("still succeeds when the old booking cannot be cancelled with Cal.com, and says so in the log", async () => {
      vi.mocked(listTeamCalls).mockResolvedValue([stored()]);
      vi.mocked(cancelCallBooking).mockRejectedValue(new Error("Cal.com answered 500"));
      expect((await bookTeamCall(tenant, invitee, input({ replaceId: "call-1" }), NOW)).ok).toBe(true);
      expect(cancelTeamCall).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalled();
    });
  });
});

describe("cancelTeamCallFor", () => {
  it("cancels the booking with Cal.com, then the call", async () => {
    vi.mocked(findTeamCall).mockResolvedValue(stored());
    expect(await cancelTeamCallFor(tenant, "call-1", NOW)).toEqual({ ok: true });
    expect(cancelCallBooking).toHaveBeenCalledWith(BOOKING_URL, "https://api.cal.com/v2/bookings/old");
    expect(cancelTeamCall).toHaveBeenCalledWith(tx, { id: "call-1", businessId: "business-1", now: NOW });
  });

  it("leaves the call as it is when Cal.com will not cancel it", async () => {
    vi.mocked(findTeamCall).mockResolvedValue(stored());
    vi.mocked(cancelCallBooking).mockRejectedValue(new Error("Cal.com answered 500"));
    expect(await cancelTeamCallFor(tenant, "call-1", NOW)).toEqual({ ok: false, reason: "failed" });
    expect(cancelTeamCall).not.toHaveBeenCalled();
  });

  it("cancels a call with no booking address on this side only", async () => {
    vi.mocked(findTeamCall).mockResolvedValue(stored({ providerUri: null }));
    expect(await cancelTeamCallFor(tenant, "call-1", NOW)).toEqual({ ok: true });
    expect(cancelCallBooking).not.toHaveBeenCalled();
  });

  it("says gone for a call that is not there, is cancelled, or has started", async () => {
    vi.mocked(findTeamCall).mockResolvedValueOnce(null);
    expect(await cancelTeamCallFor(tenant, "call-9", NOW)).toEqual({ ok: false, reason: "gone" });
    vi.mocked(findTeamCall).mockResolvedValueOnce(stored({ status: "cancelled" }));
    expect(await cancelTeamCallFor(tenant, "call-1", NOW)).toEqual({ ok: false, reason: "gone" });
    vi.mocked(findTeamCall).mockResolvedValueOnce(stored({ startsAt: new Date("2026-12-01T06:00:00.000Z") }));
    expect(await cancelTeamCallFor(tenant, "call-1", NOW)).toEqual({ ok: false, reason: "gone" });
    expect(cancelCallBooking).not.toHaveBeenCalled();
  });

  it("says gone when the call was cancelled between the check and the update", async () => {
    vi.mocked(findTeamCall).mockResolvedValue(stored());
    vi.mocked(cancelTeamCall).mockResolvedValue(false);
    expect(await cancelTeamCallFor(tenant, "call-1", NOW)).toEqual({ ok: false, reason: "gone" });
  });
});

describe("loadCalls and loadNextCall", () => {
  const callState = (booking: unknown) => ({ url: BOOKING_URL, booking, readAtMs: NOW.getTime() }) as never;

  it("joins the team calls and the kickoff into the page's two lists", async () => {
    vi.mocked(listTeamCalls).mockResolvedValue([stored()]);
    vi.mocked(getSetupCallState).mockResolvedValue(
      callState({ bookedAtIso: "x", startsAtIso: "2026-10-27T08:30:00.000Z", endsAtIso: "2026-10-27T09:00:00.000Z", heldAtIso: "2026-10-27T09:10:00.000Z", summary: "6 pages in blue and white" }),
    );
    const data = await loadCalls(tenant, NOW);
    expect(data.upcoming.map((row) => row.key)).toEqual(["call-1"]);
    expect(data.past.map((row) => [row.key, row.agreed])).toEqual([["kickoff", "6 pages in blue and white"]]);
  });

  it("gives the soonest call for Overview, and none when a read fails", async () => {
    vi.mocked(listTeamCalls).mockResolvedValue([stored()]);
    expect(await loadNextCall(tenant, NOW)).toBe("Wed 2 Dec, 14:00");
    vi.mocked(listTeamCalls).mockRejectedValue(new Error("database down"));
    expect(await loadNextCall(tenant, NOW)).toBeNull();
  });
});

describe("callsAreOpen", () => {
  const callState = (booking: unknown) => ({ url: null, booking, readAtMs: NOW.getTime() }) as never;

  beforeEach(() => {
    vi.mocked(getProjectOverview).mockResolvedValue({ project: null, completed: [] } as never);
    vi.mocked(getLiveWebsite).mockResolvedValue(null);
  });

  it("is closed to an account that has not paid", async () => {
    expect(await callsAreOpen(tenant, { hasAccess: false } as never)).toBe(false);
    expect(getSetupCallState).not.toHaveBeenCalled();
  });

  it("is closed during the first look, when the kickoff call is the only call", async () => {
    vi.mocked(getSetupCallState).mockResolvedValue(callState(null));
    expect(await callsAreOpen(tenant, { hasAccess: true } as never)).toBe(false);
  });

  it("opens once the kickoff call is held", async () => {
    vi.mocked(getSetupCallState).mockResolvedValue(callState({ bookedAtIso: "x", startsAtIso: null, endsAtIso: null, heldAtIso: "2026-10-27T09:10:00.000Z", summary: null }));
    expect(await callsAreOpen(tenant, { hasAccess: true } as never)).toBe(true);
  });
});

describe("loadBookCallOptions", () => {
  const callState = (url: string | null, booking: unknown) => ({ url, booking, readAtMs: NOW.getTime() }) as never;
  const open = { bookedAtIso: "x", startsAtIso: null, endsAtIso: null, heldAtIso: "2026-10-27T09:10:00.000Z", summary: null };

  beforeEach(() => {
    vi.mocked(getProjectOverview).mockResolvedValue({ project: null, completed: [] } as never);
    vi.mocked(getLiveWebsite).mockResolvedValue(null);
    vi.mocked(loadSetupServices).mockResolvedValue(["website"]);
  });

  it("gives the reasons the customer may pick, the booking page and whether an invitation can reach them", async () => {
    vi.mocked(getSetupCallState).mockResolvedValue(callState(BOOKING_URL, open));
    expect(await loadBookCallOptions(tenant, { hasAccess: true } as never, "priya@example.com")).toEqual({
      options: [
        { value: "website", label: "Website" },
        { value: "billing", label: "Billing" },
        { value: "other", label: "Something else" },
      ],
      bookingUrl: BOOKING_URL,
      canBook: true,
    });
    expect((await loadBookCallOptions(tenant, { hasAccess: true } as never, "919876543210@phone.brandbasket.invalid"))?.canBook).toBe(false);
  });

  it("offers nothing during the first look, or when staff have set no booking link", async () => {
    vi.mocked(getSetupCallState).mockResolvedValue(callState(BOOKING_URL, null));
    expect(await loadBookCallOptions(tenant, { hasAccess: true } as never, "priya@example.com")).toBeNull();
    vi.mocked(getSetupCallState).mockResolvedValue(callState(null, open));
    expect(await loadBookCallOptions(tenant, { hasAccess: true } as never, "priya@example.com")).toBeNull();
  });

  it("offers nothing, and logs, when a read fails", async () => {
    vi.mocked(getSetupCallState).mockRejectedValue(new Error("database down"));
    expect(await loadBookCallOptions(tenant, { hasAccess: true } as never, "priya@example.com")).toBeNull();
    expect(console.error).toHaveBeenCalled();
  });
});
