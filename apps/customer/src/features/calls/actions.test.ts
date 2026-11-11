import { beforeEach, describe, expect, it, vi } from "vitest";
import { bookCallAction, bookKickoffAction, cancelCallAction, loadSlotsAction } from "./actions";
import { bookKickoff, bookTeamCall, callsOpenFor, cancelTeamCallFor, readBookingUrl, readKickoffFacts } from "./server/calls";
import { listCallSlots } from "./server/scheduling";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireBilling: vi.fn() }));
vi.mock("./server/calls", () => ({
  bookKickoff: vi.fn(),
  bookTeamCall: vi.fn(),
  callsOpenFor: vi.fn(),
  cancelTeamCallFor: vi.fn(),
  readBookingUrl: vi.fn(),
  readKickoffFacts: vi.fn(),
}));
vi.mock("./server/scheduling", () => ({ listCallSlots: vi.fn() }));

const { requireBilling } = await import("@/lib/guards");

const CALL = "0192f3c4-0000-7000-8000-0000000000aa";
const START = "2026-12-02T08:30:00.000Z";

function customer(role: "owner" | "editor" | "viewer" = "owner", email = "meera@example.test") {
  return { user: { id: "u1", name: "Meera", email }, tenant: {}, businessId: "b1", role, services: ["website", "social"], billing: { hasAccess: true } } as never;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireBilling).mockResolvedValue(customer());
  vi.mocked(readKickoffFacts).mockResolvedValue({ booking: null, project: null, live: null });
  vi.mocked(callsOpenFor).mockReturnValue(true);
  vi.mocked(bookTeamCall).mockResolvedValue({ ok: true, startsAtIso: START, endsAtIso: START });
  vi.mocked(bookKickoff).mockResolvedValue({ ok: true, startsAtIso: START, endsAtIso: START });
});

describe("loadSlotsAction", () => {
  it("calls the live-period guard and lists the times", async () => {
    vi.mocked(readBookingUrl).mockResolvedValue("https://cal.com/a/b");
    vi.mocked(listCallSlots).mockResolvedValue([START]);
    expect(await loadSlotsAction()).toEqual({ ok: true, data: { status: "ok", slots: [START] } });
    expect(requireBilling).toHaveBeenCalledOnce();
  });

  it("offers the booking page when the times cannot be listed, and reports a failure rather than hiding it", async () => {
    vi.mocked(readBookingUrl).mockResolvedValue("https://cal.com/a/b");
    vi.mocked(listCallSlots).mockRejectedValue(new Error("down"));
    expect(await loadSlotsAction()).toEqual({ ok: true, data: { status: "unavailable", bookingUrl: "https://cal.com/a/b" } });
  });
});

describe("bookKickoffAction", () => {
  it("books with the time picked and the guard's business", async () => {
    expect(await bookKickoffAction({ startIso: START, timeZone: "Asia/Kolkata" })).toEqual({ ok: true, data: { startsAtIso: START, endsAtIso: START } });
    expect(bookKickoff).toHaveBeenCalledWith(expect.objectContaining({ businessId: "b1" }), START, "Asia/Kolkata", expect.any(Date));
  });

  it("refuses a viewer, and an account with no real email address, before booking anything", async () => {
    vi.mocked(requireBilling).mockResolvedValue(customer("viewer"));
    expect(await bookKickoffAction({ startIso: START })).toEqual({ ok: false, message: "Only the owner or an editor can change this." });
    vi.mocked(requireBilling).mockResolvedValue(customer("owner", "919876543210@phone.brandbasket.invalid"));
    expect((await bookKickoffAction({ startIso: START })).ok).toBe(false);
    expect(bookKickoff).not.toHaveBeenCalled();
  });

  it("refuses input that is not a time, and says a taken time is taken", async () => {
    expect(await bookKickoffAction({ startIso: 12 })).toMatchObject({ ok: false });
    vi.mocked(bookKickoff).mockResolvedValue({ ok: false, reason: "taken" });
    expect(await bookKickoffAction({ startIso: START })).toEqual({ ok: false, message: "That time was just taken. Please pick another." });
  });
});

describe("bookCallAction", () => {
  it("books a call about a bought service, with the note trimmed", async () => {
    expect((await bookCallAction({ startIso: START, reason: "social", note: "  About ads  " })).ok).toBe(true);
    expect(bookTeamCall).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ reason: "social", note: "About ads", replaceId: null }), expect.any(Date));
  });

  it("refuses a service the customer has not bought, naming the field", async () => {
    expect(await bookCallAction({ startIso: START, reason: "search", note: "" })).toEqual({ ok: false, message: "Choose what the call is about.", fieldErrors: { reason: "Choose what the call is about." } });
    expect(bookTeamCall).not.toHaveBeenCalled();
  });

  it("refuses a change id that is not an id, and booking while calls are closed", async () => {
    expect((await bookCallAction({ startIso: START, reason: "website", note: null, replaceId: "kickoff" })).ok).toBe(false);
    vi.mocked(callsOpenFor).mockReturnValue(false);
    expect(await bookCallAction({ startIso: START, reason: "website", note: null })).toEqual({ ok: false, message: "Calls open after your kickoff call." });
    expect(bookTeamCall).not.toHaveBeenCalled();
  });

  it("refuses rather than guesses when it cannot tell whether calls are open", async () => {
    vi.mocked(readKickoffFacts).mockRejectedValue(new Error("db down"));
    expect(await bookCallAction({ startIso: START, reason: "website", note: null })).toEqual({ ok: false, message: "We could not book that time. Please try again." });
  });

  it("says when three calls are already booked", async () => {
    vi.mocked(bookTeamCall).mockResolvedValue({ ok: false, reason: "limit" });
    expect(await bookCallAction({ startIso: START, reason: "website", note: null })).toEqual({ ok: false, message: "You already have 3 calls booked. Change or cancel one first." });
  });
});

describe("cancelCallAction", () => {
  it("cancels by id under the guard's business, and counts a call already gone as cancelled", async () => {
    vi.mocked(cancelTeamCallFor).mockResolvedValue({ ok: false, reason: "gone" });
    expect(await cancelCallAction(CALL)).toEqual({ ok: true });
    expect(cancelTeamCallFor).toHaveBeenCalledWith(expect.objectContaining({ businessId: "b1" }), CALL, expect.any(Date));
  });

  it("refuses a viewer and an id that is not an id, and says a failure failed", async () => {
    vi.mocked(requireBilling).mockResolvedValue(customer("viewer"));
    expect((await cancelCallAction(CALL)).ok).toBe(false);
    vi.mocked(requireBilling).mockResolvedValue(customer());
    expect((await cancelCallAction("../x")).ok).toBe(false);
    expect(cancelTeamCallFor).not.toHaveBeenCalled();
    vi.mocked(cancelTeamCallFor).mockResolvedValue({ ok: false, reason: "failed" });
    expect(await cancelCallAction(CALL)).toEqual({ ok: false, message: "We could not cancel that call. Please try again." });
  });
});
