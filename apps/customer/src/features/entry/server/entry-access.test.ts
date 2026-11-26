import { findBillingState, findBusinessEntry, findClientIntake, listMembershipsForUser } from "@brandbasket/db";
import { summariseBilling } from "@brandbasket/shared/lib/billing/status";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getSessionUser } from "@/lib/session";
import { unpaidSignupOwner } from "./entry-access";

vi.mock("next/headers", () => ({ cookies: vi.fn(async () => ({ get: () => undefined })) }));
vi.mock("react", async () => ({ ...(await vi.importActual<typeof import("react")>("react")), cache: <T,>(fn: T) => fn }));
vi.mock("@/lib/db", () => ({ getAppDb: vi.fn(() => ({})), getStaffDb: vi.fn(() => ({})) }));
vi.mock("@/lib/session", () => ({ getSessionUser: vi.fn() }));
vi.mock("@/features/checkout/server/entry", async () => ({ isAwaitingFirstPayment: (entry: { kind: string; signupChoice: string | null }) => entry.kind === "listing" && entry.signupChoice === "managed" }));
vi.mock("@brandbasket/shared/lib/billing/status", () => ({ summariseBilling: vi.fn() }));
vi.mock("@brandbasket/db", () => ({
  findAffiliateByUserId: vi.fn(),
  findBillingState: vi.fn(),
  findBusinessEntry: vi.fn(),
  findClientIntake: vi.fn(),
  findOpenClosureForUser: vi.fn(async () => null),
  listMembershipsForUser: vi.fn(),
  withTenantScope: vi.fn(async (_db: unknown, _tenant: unknown, run: (tx: unknown) => unknown) => run({})),
}));

const USER = { id: "user-1", email: "meera@example.test", phone: null };

function member(role: "owner" | "editor"): void {
  vi.mocked(getSessionUser).mockResolvedValue(USER as never);
  vi.mocked(listMembershipsForUser).mockResolvedValue([{ businessId: "biz-1", businessName: "Shah Sweets", role }] as never);
}

beforeEach(() => {
  vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "managed" } as never);
  vi.mocked(findBillingState).mockResolvedValue({ currency: "USD" } as never);
  vi.mocked(findClientIntake).mockResolvedValue({ askedForServices: ["managed-website", "social-media"] } as never);
  vi.mocked(summariseBilling).mockReturnValue({ status: "unpaid" } as never);
  member("owner");
});

describe("unpaidSignupOwner", () => {
  it("names the business's currency and the basket the questions were last asked for", async () => {
    expect(await unpaidSignupOwner()).toEqual({ currency: "USD", savedServices: ["managed-website", "social-media"] });
  });

  it("has no saved basket for an account that was asked nothing", async () => {
    vi.mocked(findClientIntake).mockResolvedValue(null);
    expect(await unpaidSignupOwner()).toEqual({ currency: "USD", savedServices: [] });
  });

  it("is null for a paid or lapsed business, a team member, a client invited by staff and nobody signed in", async () => {
    vi.mocked(summariseBilling).mockReturnValue({ status: "paid" } as never);
    expect(await unpaidSignupOwner()).toBeNull();
    vi.mocked(summariseBilling).mockReturnValue({ status: "lapsed" } as never);
    expect(await unpaidSignupOwner()).toBeNull();
    vi.mocked(summariseBilling).mockReturnValue({ status: "unpaid" } as never);
    vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "website", signupChoice: null } as never);
    expect(await unpaidSignupOwner()).toBeNull();
    vi.mocked(findBusinessEntry).mockResolvedValue({ kind: "listing", signupChoice: "managed" } as never);
    member("editor");
    expect(await unpaidSignupOwner()).toBeNull();
    vi.mocked(getSessionUser).mockResolvedValue(null);
    expect(await unpaidSignupOwner()).toBeNull();
  });
});
