import { findAnnouncement, findBusinessTimeZone, getBusinessHours, getBusinessProfile, getOwnerContact, listClosures, listMediaAssets } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { reportError } from "@/lib/report";
import { loadBrand, loadContact, loadSiteFacts } from "./loader";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("@/lib/db", () => ({ getAppDb: () => ({}) }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn(() => "event-1") }));
vi.mock("@brandbasket/db", () => ({
  withTenantScope: async (_db: unknown, _scope: unknown, work: (tx: unknown) => Promise<unknown>) => work({}),
  findAnnouncement: vi.fn(),
  findBusinessTimeZone: vi.fn(),
  getBusinessHours: vi.fn(),
  getBusinessProfile: vi.fn(),
  getOwnerContact: vi.fn(),
  listClosures: vi.fn(),
  listMediaAssets: vi.fn(),
}));

const customer = { user: { id: "user-1" }, tenant: { userId: "user-1", businessId: "b-1", businessName: "Apex", role: "owner" }, businessId: "b-1", businessName: "Apex Diagnostics" } as never;

beforeEach(() => {
  vi.clearAllMocks();
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-11-03T05:00:00Z"));
});

describe("loadContact", () => {
  it("shows what is saved, with the number in its own country's layout", async () => {
    vi.mocked(getBusinessProfile).mockResolvedValue({ displayName: "Apex", phone: "+919820155012", email: "a@apex.in", city: "Mumbai", addressLine1: null, serviceAreas: "Dadar" } as never);
    const loaded = await loadContact(customer);
    expect(loaded).toMatchObject({ ok: true, data: { displayName: "Apex", phoneCountry: "IN", dialCode: "+91", phone: "98201 55012", email: "a@apex.in", city: "Mumbai", addressLine1: "", serviceAreas: "Dadar" } });
    expect(getOwnerContact).not.toHaveBeenCalled();
  });

  it("offers the owner's sign-up phone and email, and the business name, when nothing is saved", async () => {
    vi.mocked(getBusinessProfile).mockResolvedValue(null);
    vi.mocked(getOwnerContact).mockResolvedValue({ email: "owner@apex.in", phone: "+919820155012" });
    expect(await loadContact(customer)).toMatchObject({ ok: true, data: { displayName: "Apex Diagnostics", email: "owner@apex.in", phone: "98201 55012" } });
  });

  it("guesses India when there is no number and no visitor country", async () => {
    vi.mocked(getBusinessProfile).mockResolvedValue(null);
    vi.mocked(getOwnerContact).mockResolvedValue({ email: null, phone: null });
    expect(await loadContact(customer)).toMatchObject({ ok: true, data: { phoneCountry: "IN", dialCode: "+91", phone: "" } });
  });

  it("returns a failure the panel shows, and reports it, when the read fails", async () => {
    vi.mocked(getBusinessProfile).mockRejectedValue(new Error("db down"));
    const loaded = await loadContact(customer);
    expect(loaded).toMatchObject({ ok: false, error: { eventId: "event-1" } });
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { area: "business.contact" });
  });
});

describe("loadSiteFacts", () => {
  it("reads hours, upcoming holidays and the announcement, with today in the business's zone", async () => {
    vi.mocked(findBusinessTimeZone).mockResolvedValue("America/Los_Angeles");
    vi.mocked(getBusinessHours).mockResolvedValue([{ id: "h1", dayOfWeek: 0, opensAt: "09:00:00", closesAt: "18:00:00", closed: false, openAllDay: false }]);
    vi.mocked(listClosures).mockResolvedValue([
      { id: "later", startsOn: "2026-12-01", endsOn: "2026-12-01", note: null },
      { id: "past", startsOn: "2026-10-01", endsOn: "2026-10-02", note: null },
      { id: "today", startsOn: "2026-11-02", endsOn: "2026-11-02", note: "Diwali" },
    ]);
    vi.mocked(findAnnouncement).mockResolvedValue(null);
    const loaded = await loadSiteFacts(customer);
    expect(loaded.ok && loaded.data.today).toBe("2026-11-02");
    expect(loaded.ok && loaded.data.closures.map((closure) => closure.id)).toEqual(["today", "later"]);
    expect(loaded.ok && loaded.data.hours["hours.0.opens"]).toBe("09:00");
    expect(loaded.ok && loaded.data.announcement).toBeNull();
    expect(loaded.ok && [loaded.data.defaultStartsOn, loaded.data.defaultEndsOn]).toEqual(["2026-11-02", "2026-11-04"]);
  });

  it("falls back to UTC without a stored zone", async () => {
    vi.mocked(findBusinessTimeZone).mockResolvedValue(null);
    vi.mocked(getBusinessHours).mockResolvedValue([]);
    vi.mocked(listClosures).mockResolvedValue([]);
    vi.mocked(findAnnouncement).mockResolvedValue({ message: "Open", startsOn: "2026-11-03", endsOn: "2026-11-05" });
    const loaded = await loadSiteFacts(customer);
    expect(loaded).toMatchObject({ ok: true, data: { today: "2026-11-03", announcement: { message: "Open" } } });
  });

  it("returns a failure instead of an empty week when a read fails", async () => {
    vi.mocked(findBusinessTimeZone).mockRejectedValue(new Error("db down"));
    expect(await loadSiteFacts(customer)).toMatchObject({ ok: false });
    expect(reportError).toHaveBeenCalledWith(expect.any(Error), { area: "business.site-facts" });
  });
});

describe("loadBrand", () => {
  const asset = (id: string) => ({ id, width: 800, height: 600, altText: null, originalFilename: `${id}.jpg` });

  it("takes the newest logo and lists the photos", async () => {
    vi.mocked(listMediaAssets).mockImplementation(async (_tx, purpose) => (purpose === "logo" ? [asset("old"), asset("new")] : [asset("p1"), asset("p2")]) as never);
    const loaded = await loadBrand(customer);
    expect(loaded.ok && loaded.data.logo?.id).toBe("new");
    expect(loaded.ok && loaded.data.photos.map((photo) => photo.id)).toEqual(["p1", "p2"]);
  });

  it("has no logo when none is stored", async () => {
    vi.mocked(listMediaAssets).mockResolvedValue([]);
    expect(await loadBrand(customer)).toEqual({ ok: true, data: { logo: null, photos: [] } });
  });

  it("returns a failure instead of an empty library that looks like having none", async () => {
    vi.mocked(listMediaAssets).mockRejectedValue(new Error("db down"));
    expect(await loadBrand(customer)).toMatchObject({ ok: false });
  });
});
