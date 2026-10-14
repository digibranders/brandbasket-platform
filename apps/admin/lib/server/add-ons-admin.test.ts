import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@firstfold/db", async () => {
  const actual = await vi.importActual<typeof import("@firstfold/db")>("@firstfold/db");
  return {
    ...actual,
    findAddOnSubscription: vi.fn(),
    listAddOnSubscriptionsForStaff: vi.fn(),
    listPressReleasesForBusiness: vi.fn(),
    markAddOnContacted: vi.fn(),
    setPressReleaseStatus: vi.fn(),
  };
});
vi.mock("@firstfold/shared/server/add-on-ends", () => ({ scheduleAddOnEndFor: vi.fn() }));
vi.mock("@firstfold/shared/server/billing-log", async () => {
  const actual = await vi.importActual<typeof import("@firstfold/shared/server/billing-log")>("@firstfold/shared/server/billing-log");
  return { ...actual, logBillingEvent: vi.fn() };
});
vi.mock("./billing-provider", () => ({ getBillingProvider: () => ({ name: "razorpay" }) }));
vi.mock("./db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));

import {
  findAddOnSubscription,
  listAddOnSubscriptionsForStaff,
  listPressReleasesForBusiness,
  markAddOnContacted,
  setPressReleaseStatus,
} from "@firstfold/db";
import { scheduleAddOnEndFor } from "@firstfold/shared/server/add-on-ends";
import { logBillingEvent } from "@firstfold/shared/server/billing-log";
import { endClientAddOn, loadClientAddOns, markClientAddOnContacted, setClientPressReleaseStatus } from "./add-ons-admin";

const BUSINESS = "0192f3c4-1111-7000-8000-000000000001";
const OTHER_BUSINESS = "0192f3c4-1111-7000-8000-000000000002";
const ROW = "0192f3c4-2222-7000-8000-000000000001";
const RELEASE = "0192f3c4-3333-7000-8000-000000000001";
const STAFF = "staff-1";
const NOW = new Date("2026-10-20T09:00:00.000Z");

beforeEach(() => {
  vi.resetAllMocks();
});

describe("endClientAddOn", () => {
  it("ends the add-on through the one shared function, as the staff member, with the staff provider", async () => {
    const outcome = { kind: "scheduled", addOn: "local-seo", endKind: "pause", endsOn: NOW } as const;
    vi.mocked(scheduleAddOnEndFor).mockResolvedValue(outcome);

    const result = await endClientAddOn({ businessId: BUSINESS, addOnSubscriptionId: ROW, kind: "pause", staffUserId: STAFF }, NOW);

    expect(result).toBe(outcome);
    expect(scheduleAddOnEndFor).toHaveBeenCalledWith(
      { name: "staff-db" },
      { name: "razorpay" },
      { businessId: BUSINESS, addOnSubscriptionId: ROW, kind: "pause", staffUserId: STAFF },
      NOW,
    );
  });

  it("passes a refusal back unchanged, so the caller can say why", async () => {
    const refused = { kind: "refused", reason: "provider-unavailable", addOn: "local-seo", endKind: null, endsOn: null } as const;
    vi.mocked(scheduleAddOnEndFor).mockResolvedValue(refused);
    expect(await endClientAddOn({ businessId: BUSINESS, addOnSubscriptionId: ROW, kind: "cancel", staffUserId: STAFF }, NOW)).toBe(refused);
  });
});

describe("markClientAddOnContacted", () => {
  it("marks a paid purchase of this business as contacted by the staff member", async () => {
    vi.mocked(findAddOnSubscription).mockResolvedValue({ id: ROW, activatedAt: NOW } as never);
    vi.mocked(markAddOnContacted).mockResolvedValue(true);

    expect(await markClientAddOnContacted({ businessId: BUSINESS, addOnSubscriptionId: ROW, staffUserId: STAFF }, NOW)).toBe("marked");
    expect(findAddOnSubscription).toHaveBeenCalledWith({ name: "staff-db" }, BUSINESS, ROW);
    expect(markAddOnContacted).toHaveBeenCalledWith({ name: "staff-db" }, { id: ROW, staffUserId: STAFF, now: NOW });
  });

  it("is idempotent: marking it again changes nothing and says so", async () => {
    vi.mocked(findAddOnSubscription).mockResolvedValue({ id: ROW, activatedAt: NOW } as never);
    vi.mocked(markAddOnContacted).mockResolvedValueOnce(true).mockResolvedValueOnce(false);
    const input = { businessId: BUSINESS, addOnSubscriptionId: ROW, staffUserId: STAFF };

    expect(await markClientAddOnContacted(input, NOW)).toBe("marked");
    expect(await markClientAddOnContacted(input, NOW)).toBe("already");
  });

  it("finds nothing for a purchase that belongs to another business, and writes nothing", async () => {
    vi.mocked(findAddOnSubscription).mockResolvedValue(null);
    expect(await markClientAddOnContacted({ businessId: OTHER_BUSINESS, addOnSubscriptionId: ROW, staffUserId: STAFF }, NOW)).toBe("not-found");
    expect(markAddOnContacted).not.toHaveBeenCalled();
  });

  it("finds nothing for a checkout that was never paid", async () => {
    vi.mocked(findAddOnSubscription).mockResolvedValue({ id: ROW, activatedAt: null } as never);
    expect(await markClientAddOnContacted({ businessId: BUSINESS, addOnSubscriptionId: ROW, staffUserId: STAFF }, NOW)).toBe("not-found");
    expect(markAddOnContacted).not.toHaveBeenCalled();
  });
});

describe("setClientPressReleaseStatus", () => {
  const input = { businessId: BUSINESS, pressReleaseId: RELEASE, status: "in_progress", staffUserId: STAFF } as const;

  it("moves one of this business's press releases on, as the staff member", async () => {
    vi.mocked(listPressReleasesForBusiness).mockResolvedValue([{ id: RELEASE }] as never);
    vi.mocked(setPressReleaseStatus).mockResolvedValue(true);

    expect(await setClientPressReleaseStatus(input, NOW)).toBe("changed");
    expect(listPressReleasesForBusiness).toHaveBeenCalledWith({ name: "staff-db" }, BUSINESS);
    expect(setPressReleaseStatus).toHaveBeenCalledWith({ name: "staff-db" }, { id: RELEASE, status: "in_progress", staffUserId: STAFF, now: NOW });
  });

  it("leaves a release alone that is already at that step or past it", async () => {
    vi.mocked(listPressReleasesForBusiness).mockResolvedValue([{ id: RELEASE }] as never);
    vi.mocked(setPressReleaseStatus).mockResolvedValue(false);
    expect(await setClientPressReleaseStatus(input, NOW)).toBe("unchanged");
  });

  it("finds nothing for a release that belongs to another business, and writes nothing", async () => {
    vi.mocked(listPressReleasesForBusiness).mockResolvedValue([]);
    expect(await setClientPressReleaseStatus({ ...input, businessId: OTHER_BUSINESS }, NOW)).toBe("not-found");
    expect(setPressReleaseStatus).not.toHaveBeenCalled();
  });
});

describe("loadClientAddOns", () => {
  it("builds the section's rows from the business's add-on rows and press releases", async () => {
    vi.mocked(listAddOnSubscriptionsForStaff).mockResolvedValue([
      {
        id: ROW,
        businessId: BUSINESS,
        addOn: "local-seo",
        discountAmountCents: 0,
        netAmountCents: 1_000_000,
        currency: "INR",
        status: "active",
        endKind: null,
        endRequestedAt: null,
        endRequestedByStaffId: null,
        endRequestedByStaffName: null,
        activatedAt: new Date("2026-10-12T09:00:00.000Z"),
        contactedAt: null,
        currentPeriodEnd: new Date("2026-11-12T09:00:00.000Z"),
        haltedAt: null,
        endedAt: null,
        startAt: null,
        createdAt: new Date("2026-10-12T09:00:00.000Z"),
      },
    ] as never);
    vi.mocked(listPressReleasesForBusiness).mockResolvedValue([
      { id: RELEASE, status: "waiting", createdAt: NOW, paidAt: NOW, amountCents: 826_000 },
    ] as never);

    const loaded = await loadClientAddOns(BUSINESS, NOW);

    expect(listAddOnSubscriptionsForStaff).toHaveBeenCalledWith({ name: "staff-db" }, BUSINESS);
    expect(loaded.addOns).toHaveLength(1);
    expect(loaded.addOns[0]).toMatchObject({ id: ROW, title: "Local SEO", canEnd: true });
    expect(loaded.pressReleases).toHaveLength(1);
    expect(loaded.pressReleases[0]).toMatchObject({ id: RELEASE, nextSteps: ["in_progress", "published"] });
    expect(logBillingEvent).not.toHaveBeenCalled();
  });

  it("logs a row it cannot make sense of, by id only, and still returns the page's data", async () => {
    vi.mocked(listAddOnSubscriptionsForStaff).mockResolvedValue([
      {
        id: ROW,
        businessId: BUSINESS,
        addOn: "local-seo",
        discountAmountCents: 0,
        netAmountCents: 1_000_000,
        currency: "INR",
        status: "active",
        endKind: null,
        endRequestedAt: null,
        endRequestedByStaffId: null,
        endRequestedByStaffName: null,
        activatedAt: NOW,
        contactedAt: null,
        currentPeriodEnd: null,
        haltedAt: null,
        endedAt: null,
        startAt: null,
        createdAt: NOW,
      },
    ] as never);
    vi.mocked(listPressReleasesForBusiness).mockResolvedValue([]);

    const loaded = await loadClientAddOns(BUSINESS, NOW);

    expect(loaded.addOns[0]).toMatchObject({ broken: true });
    expect(logBillingEvent).toHaveBeenCalledWith("error", "add-on-view-failed", { businessId: BUSINESS, addOnSubscriptionId: ROW });
  });
});
