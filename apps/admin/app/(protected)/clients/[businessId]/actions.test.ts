import {
  findClientDetail,
  findListingPlacement,
  ListingPlaceTakenError,
  saveListingPlacement,
  setDirectoryTrusted,
  trustDirectoryBusiness,
  upsertDirectoryVerification,
} from "@fynix/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { changeWebAddress } from "@/lib/server/web-address";
import { finishClientUpgrade, moveClientToPremium } from "@/lib/server/plan-upgrade-admin";
import { endClientAddOn, markClientAddOnContacted, setClientPressReleaseStatus } from "@/lib/server/add-ons-admin";
import { getStaffDb } from "@/lib/server/db";
import {
  addChargeAction,
  changeWebAddressAction,
  endAddOnAction,
  finishUpgradeAction,
  giveClientTrustedAction,
  giveClientVerifiedAction,
  removeClientTrustedAction,
  markAddOnContactedAction,
  markChargePaidAction,
  moveToPremiumAction,
  recordManualPaymentAction,
  resolvePaymentAttentionAction,
  saveListingPlacementAction,
  setPressReleaseStatusAction,
  waiveChargeAction,
} from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@fynix/db", async () => {
  const actual = await vi.importActual<typeof import("@fynix/db")>("@fynix/db");
  return {
    ...actual,
    saveListingPlacement: vi.fn(),
    findListingPlacement: vi.fn(),
    findClientDetail: vi.fn(),
    setDirectoryTrusted: vi.fn(),
    trustDirectoryBusiness: vi.fn(),
    upsertDirectoryVerification: vi.fn(),
  };
});
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn() }));
vi.mock("@/lib/server/web-address", () => ({ changeWebAddress: vi.fn() }));
// The page's other actions' server modules: not under test here, and they reach for the environment when loaded.
vi.mock("@/lib/server/add-ons-admin", () => ({
  endClientAddOn: vi.fn(),
  markClientAddOnContacted: vi.fn(),
  setClientPressReleaseStatus: vi.fn(),
}));
vi.mock("@/lib/server/billing-admin", () => ({}));
vi.mock("@/lib/server/charges-admin", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/plan-upgrade-admin", () => ({ moveClientToPremium: vi.fn(), finishClientUpgrade: vi.fn() }));
vi.mock("@/lib/server/project-launch", () => ({}));
vi.mock("@/lib/server/project-preview", () => ({}));
vi.mock("@/lib/server/site-token", () => ({}));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "finance" } } as unknown as GrantedStaff;
const SUPPORT_STAFF = { user: { id: "staff-2" }, staff: { userId: "staff-2", role: "support" } } as unknown as GrantedStaff;
const IDLE = { status: "idle" } as const;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

const POSTED = { businessId: BUSINESS, placeId: "k7m2q9a", urlSlug: "smile-dental-care", citySlug: "thane", reason: "Rebranded" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
});

describe("the money actions", () => {
  beforeEach(() => {
    vi.mocked(requireStaffAccess).mockResolvedValue(SUPPORT_STAFF);
    vi.mocked(redirect).mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`);
    });
  });

  // An empty form on purpose: the role check must come before the form is read, so a refusal is never mistaken for a
  // bad form, and nothing is touched.
  it.each([
    ["recordManualPaymentAction", recordManualPaymentAction],
    ["addChargeAction", addChargeAction],
    ["markChargePaidAction", markChargePaidAction],
    ["waiveChargeAction", waiveChargeAction],
    ["resolvePaymentAttentionAction", resolvePaymentAttentionAction],
    ["moveToPremiumAction", moveToPremiumAction],
    ["finishUpgradeAction", finishUpgradeAction],
    ["endAddOnAction", endAddOnAction],
  ])("%s sends support staff to the no-access page and records the refusal", async (_name, action) => {
    await expect(action(form({}))).rejects.toThrow("redirect:/no-access");
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-2", action: "access.denied", targetType: "money", result: "denied" });
    expect(moveClientToPremium).not.toHaveBeenCalled();
    expect(finishClientUpgrade).not.toHaveBeenCalled();
    expect(endClientAddOn).not.toHaveBeenCalled();
  });

  it.each([
    ["markAddOnContactedAction", markAddOnContactedAction],
    ["setPressReleaseStatusAction", setPressReleaseStatusAction],
  ])("%s stays open to support staff, because it is not money", async (_name, action) => {
    // The form is empty, so it fails on its own ids: the point is that it got past the role check.
    await expect(action(form({}))).rejects.toThrow("must be a valid id");
    expect(logStaffAccess).not.toHaveBeenCalled();
  });
});

describe("changeWebAddressAction", () => {
  it("is refused for a session that is not staff's, before anything is read", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(changeWebAddressAction(IDLE, form(POSTED))).rejects.toThrow("NEXT_REDIRECT");
    expect(changeWebAddress).not.toHaveBeenCalled();
  });

  it("changes the address as the signed-in staff member and refreshes the pages that show it", async () => {
    const changed = { status: "changed", url: "https://fynix.digital/in/mh/thane/business/smile-dental-care/k7m2q9a" } as const;
    vi.mocked(changeWebAddress).mockResolvedValue(changed);
    const data = form(POSTED);
    expect(await changeWebAddressAction(IDLE, data)).toEqual(changed);
    expect(changeWebAddress).toHaveBeenCalledWith({ formData: data, staffUserId: "staff-1", now: expect.any(Date) });
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
    expect(revalidatePath).toHaveBeenCalledWith("/ads");
  });

  it("hands a refusal back to the form and refreshes nothing", async () => {
    const refusal = { status: "error", field: "reason", message: "Say why, in 3 to 300 characters.", values: { urlSlug: "x", citySlug: "thane", reason: "no" } } as const;
    vi.mocked(changeWebAddress).mockResolvedValue(refusal);
    expect(await changeWebAddressAction(IDLE, form({ ...POSTED, reason: "no" }))).toEqual(refusal);
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("throws on a form that does not name the page's business", async () => {
    await expect(changeWebAddressAction(IDLE, form({ ...POSTED, businessId: "nope" }))).rejects.toThrow("must be a valid id");
    expect(changeWebAddress).not.toHaveBeenCalled();
  });
});

describe("saveListingPlacementAction", () => {
  const PLACEMENT = {
    businessId: BUSINESS,
    category: "dentists",
    city: "thane",
    area: "naupada",
    slug: "bright-teeth",
    lat: "19.19",
    lon: "72.97",
    pinLabel: "Gokhale Road",
    whatsappPhone: "",
    bookingUrl: "",
    replacesSourcePath: "",
    takeOverPlaceId: "k7m2q9a",
  };

  beforeEach(() => {
    // redirect() ends the action, as Next's does by throwing.
    vi.mocked(redirect).mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`);
    });
  });

  it.each([
    ["added", "place-added"],
    ["listing", "place-taken"],
  ] as const)("says why a business could not be taken over (%s)", async (reason, notice) => {
    vi.mocked(saveListingPlacement).mockRejectedValue(new ListingPlaceTakenError("k7m2q9a", reason));
    await expect(saveListingPlacementAction(form(PLACEMENT))).rejects.toThrow(`redirect:/clients/${BUSINESS}?listing=${notice}#listing`);
  });
});

describe("moveToPremiumAction", () => {
  const PLAN = (notice: string): string => `redirect:/clients/${BUSINESS}?plan=${notice}#plan`;

  beforeEach(() => {
    // redirect() ends the action, as Next's does by throwing.
    vi.mocked(redirect).mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`);
    });
  });

  it("is refused for a session that is not staff's, before anything is moved", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(moveToPremiumAction(form({ businessId: BUSINESS, confirm: "yes" }))).rejects.toThrow("NEXT_REDIRECT");
    expect(moveClientToPremium).not.toHaveBeenCalled();
  });

  it("moves nobody unless the box was ticked", async () => {
    await expect(moveToPremiumAction(form({ businessId: BUSINESS }))).rejects.toThrow(PLAN("confirm"));
    await expect(moveToPremiumAction(form({ businessId: BUSINESS, confirm: "on" }))).rejects.toThrow(PLAN("confirm"));
    expect(moveClientToPremium).not.toHaveBeenCalled();
  });

  it("throws on a form that does not name the page's business", async () => {
    await expect(moveToPremiumAction(form({ businessId: "nope", confirm: "yes" }))).rejects.toThrow("must be a valid id");
    expect(moveClientToPremium).not.toHaveBeenCalled();
  });

  it("moves them as the signed-in staff member and says so", async () => {
    vi.mocked(moveClientToPremium).mockResolvedValue({ kind: "moved", finish: { kind: "scheduled" } } as never);
    await expect(moveToPremiumAction(form({ businessId: BUSINESS, confirm: "yes" }))).rejects.toThrow(PLAN("moved"));
    expect(moveClientToPremium).toHaveBeenCalledWith({ businessId: BUSINESS, staffUserId: "staff-1" }, expect.any(Date));
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("says when they have Premium but the provider did not take the change", async () => {
    vi.mocked(moveClientToPremium).mockResolvedValue({ kind: "moved", finish: { kind: "failed" } } as never);
    await expect(moveToPremiumAction(form({ businessId: BUSINESS, confirm: "yes" }))).rejects.toThrow(PLAN("moved-provider-failed"));
  });

  it.each(["blocked", "unavailable", "changed"] as const)("says why a move was refused (%s)", async (why) => {
    vi.mocked(moveClientToPremium).mockResolvedValue({ kind: "refused", why });
    await expect(moveToPremiumAction(form({ businessId: BUSINESS, confirm: "yes" }))).rejects.toThrow(PLAN(`refused-${why}`));
  });
});

describe("finishUpgradeAction", () => {
  const PLAN = (notice: string): string => `redirect:/clients/${BUSINESS}?plan=${notice}#plan`;

  beforeEach(() => {
    vi.mocked(redirect).mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`);
    });
  });

  it("is refused for a session that is not staff's", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(finishUpgradeAction(form({ businessId: BUSINESS }))).rejects.toThrow("NEXT_REDIRECT");
    expect(finishClientUpgrade).not.toHaveBeenCalled();
  });

  it.each([
    ["scheduled", "finished"],
    ["completed", "finished"],
    ["failed", "finish-failed"],
    ["nothing", "nothing-to-finish"],
  ] as const)("says what finishing the move came to (%s)", async (kind, notice) => {
    vi.mocked(finishClientUpgrade).mockResolvedValue({ kind } as never);
    await expect(finishUpgradeAction(form({ businessId: BUSINESS }))).rejects.toThrow(PLAN(notice));
    expect(finishClientUpgrade).toHaveBeenCalledWith({ businessId: BUSINESS, staffUserId: "staff-1" }, expect.any(Date));
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });
});

describe("the add-on actions", () => {
  const ROW = "01a0f71b-8402-7d48-a90a-207e8c8a8800";
  const RELEASE = "01a0f71b-8402-7d48-a90a-207e8c8a8811";
  const NOTICE = (notice: string): string => `redirect:/clients/${BUSINESS}?addOns=${notice}#add-ons`;
  const END = { businessId: BUSINESS, addOnSubscriptionId: ROW, kind: "pause", confirm: "yes" };

  beforeEach(() => {
    vi.mocked(redirect).mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`);
    });
  });

  describe("endAddOnAction", () => {
    it("is refused for a session that is not staff's, before anything is read or ended", async () => {
      vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
      await expect(endAddOnAction(form({ ...END, businessId: "nope" }))).rejects.toThrow("NEXT_REDIRECT");
      expect(endClientAddOn).not.toHaveBeenCalled();
    });

    it("ends nothing unless the first-person box was ticked", async () => {
      await expect(endAddOnAction(form({ ...END, confirm: "" }))).rejects.toThrow(NOTICE("unconfirmed"));
      await expect(endAddOnAction(form({ ...END, confirm: "on" }))).rejects.toThrow(NOTICE("unconfirmed"));
      expect(endClientAddOn).not.toHaveBeenCalled();
    });

    it("throws on ids that are not ids, and on a kind that is neither cancel nor pause", async () => {
      await expect(endAddOnAction(form({ ...END, businessId: "nope" }))).rejects.toThrow("must be a valid id");
      await expect(endAddOnAction(form({ ...END, addOnSubscriptionId: "nope" }))).rejects.toThrow("must be a valid id");
      await expect(endAddOnAction(form({ ...END, kind: "delete" }))).rejects.toThrow("cancel or pause");
      expect(endClientAddOn).not.toHaveBeenCalled();
    });

    it("pauses as the signed-in staff member and says so", async () => {
      vi.mocked(endClientAddOn).mockResolvedValue({ kind: "scheduled", addOn: "local-seo", endKind: "pause", endsOn: new Date() });
      await expect(endAddOnAction(form(END))).rejects.toThrow(NOTICE("pause-scheduled"));
      expect(endClientAddOn).toHaveBeenCalledWith(
        { businessId: BUSINESS, addOnSubscriptionId: ROW, kind: "pause", staffUserId: "staff-1" },
        expect.any(Date),
      );
      expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
    });

    it("cancels, and says why when the provider could not be told", async () => {
      vi.mocked(endClientAddOn).mockResolvedValue({ kind: "scheduled", addOn: "local-seo", endKind: "cancel", endsOn: new Date() });
      await expect(endAddOnAction(form({ ...END, kind: "cancel" }))).rejects.toThrow(NOTICE("cancel-scheduled"));
      vi.mocked(endClientAddOn).mockResolvedValue({ kind: "refused", reason: "provider-unavailable", addOn: "local-seo", endKind: null, endsOn: null });
      await expect(endAddOnAction(form({ ...END, kind: "cancel" }))).rejects.toThrow(NOTICE("provider-unavailable"));
    });
  });

  describe("markAddOnContactedAction", () => {
    const MARK = { businessId: BUSINESS, addOnSubscriptionId: ROW };

    it("is refused for a session that is not staff's", async () => {
      vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
      await expect(markAddOnContactedAction(form(MARK))).rejects.toThrow("NEXT_REDIRECT");
      expect(markClientAddOnContacted).not.toHaveBeenCalled();
    });

    it("throws on ids that are not ids", async () => {
      await expect(markAddOnContactedAction(form({ ...MARK, addOnSubscriptionId: "x" }))).rejects.toThrow("must be a valid id");
      expect(markClientAddOnContacted).not.toHaveBeenCalled();
    });

    it("marks it as the signed-in staff member, and a repeat just says it was already done", async () => {
      vi.mocked(markClientAddOnContacted).mockResolvedValueOnce("marked").mockResolvedValueOnce("already");
      await expect(markAddOnContactedAction(form(MARK))).rejects.toThrow(NOTICE("contacted"));
      expect(markClientAddOnContacted).toHaveBeenCalledWith({ businessId: BUSINESS, addOnSubscriptionId: ROW, staffUserId: "staff-1" }, expect.any(Date));
      expect(revalidatePath).toHaveBeenCalledWith("/");
      await expect(markAddOnContactedAction(form(MARK))).rejects.toThrow(NOTICE("already-contacted"));
    });

    it("says it could not find a purchase that is not this business's", async () => {
      vi.mocked(markClientAddOnContacted).mockResolvedValue("not-found");
      await expect(markAddOnContactedAction(form(MARK))).rejects.toThrow(NOTICE("not-found"));
    });
  });

  describe("setPressReleaseStatusAction", () => {
    const SET = { businessId: BUSINESS, pressReleaseId: RELEASE, status: "in_progress" };

    it("is refused for a session that is not staff's", async () => {
      vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
      await expect(setPressReleaseStatusAction(form(SET))).rejects.toThrow("NEXT_REDIRECT");
      expect(setClientPressReleaseStatus).not.toHaveBeenCalled();
    });

    it("throws on ids that are not ids, and on any status staff may not set (waiting is never a step forward)", async () => {
      await expect(setPressReleaseStatusAction(form({ ...SET, pressReleaseId: "x" }))).rejects.toThrow("must be a valid id");
      await expect(setPressReleaseStatusAction(form({ ...SET, status: "waiting" }))).rejects.toThrow("in progress or published");
      await expect(setPressReleaseStatusAction(form({ ...SET, status: "" }))).rejects.toThrow("in progress or published");
      expect(setClientPressReleaseStatus).not.toHaveBeenCalled();
    });

    it("moves the release on as the signed-in staff member and says which step", async () => {
      vi.mocked(setClientPressReleaseStatus).mockResolvedValue("changed");
      await expect(setPressReleaseStatusAction(form(SET))).rejects.toThrow(NOTICE("release-in-progress"));
      expect(setClientPressReleaseStatus).toHaveBeenCalledWith(
        { businessId: BUSINESS, pressReleaseId: RELEASE, status: "in_progress", staffUserId: "staff-1" },
        expect.any(Date),
      );
      await expect(setPressReleaseStatusAction(form({ ...SET, status: "published" }))).rejects.toThrow(NOTICE("release-published"));
    });

    it("says nothing changed when the release was already at that step or further on (a stale form)", async () => {
      vi.mocked(setClientPressReleaseStatus).mockResolvedValue("unchanged");
      await expect(setPressReleaseStatusAction(form(SET))).rejects.toThrow(NOTICE("release-unchanged"));
    });

    it("says it could not find a release that is not this business's", async () => {
      vi.mocked(setClientPressReleaseStatus).mockResolvedValue("not-found");
      await expect(setPressReleaseStatusAction(form(SET))).rejects.toThrow(NOTICE("not-found"));
    });
  });
});

describe("the client's Verified and Trusted tags", () => {
  const DB = { name: "staff-db" } as unknown as ReturnType<typeof getStaffDb>;
  const PLACEMENT = { categorySlug: "dentists", citySlug: "thane", areaSlug: "kolshet", slug: "holiday-test-dental" };
  const KEY = "dentists/thane/kolshet/holiday-test-dental";

  beforeEach(() => {
    // Support staff, not finance: the tags are a directory job, not a money one.
    vi.mocked(requireStaffAccess).mockResolvedValue(SUPPORT_STAFF);
    vi.mocked(getStaffDb).mockReturnValue(DB);
    vi.mocked(findListingPlacement).mockResolvedValue(PLACEMENT as never);
    vi.mocked(findClientDetail).mockResolvedValue({ businessName: "Holiday Dental Ltd", profile: { displayName: "Holiday Test Dental" } } as never);
    vi.mocked(redirect).mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`);
    });
  });

  it("gives Trusted under the listing's own key and the client's shown name, never a key from the form", async () => {
    vi.mocked(trustDirectoryBusiness).mockResolvedValue(true);
    await expect(giveClientTrustedAction(form({ businessId: BUSINESS, listingKey: "gyms/thane/other/not-this-one" }))).rejects.toThrow(
      `redirect:/clients/${BUSINESS}?tags=trusted#listing`,
    );
    expect(trustDirectoryBusiness).toHaveBeenCalledWith(
      DB,
      expect.objectContaining({ listingKey: KEY, businessName: "Holiday Test Dental", phone: null, staffUserId: "staff-2" }),
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("says nothing changed when the client already had the tag", async () => {
    vi.mocked(trustDirectoryBusiness).mockResolvedValue(false);
    await expect(giveClientTrustedAction(form({ businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?tags=unchanged#listing`);
  });

  it("takes Trusted away without touching the verification", async () => {
    vi.mocked(setDirectoryTrusted).mockResolvedValue(true);
    await expect(removeClientTrustedAction(form({ businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?tags=untrusted#listing`);
    expect(setDirectoryTrusted).toHaveBeenCalledWith(DB, KEY, false, expect.any(Date));
    expect(upsertDirectoryVerification).not.toHaveBeenCalled();
  });

  it("gives Verified with no number of its own, since the website uses the client's", async () => {
    vi.mocked(upsertDirectoryVerification).mockResolvedValue({ replaced: false });
    await expect(giveClientVerifiedAction(form({ businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?tags=verified#listing`);
    expect(upsertDirectoryVerification).toHaveBeenCalledWith(DB, expect.objectContaining({ listingKey: KEY, phone: null, staffUserId: "staff-2" }));
    expect(vi.mocked(upsertDirectoryVerification).mock.calls[0]?.[1]).not.toHaveProperty("trusted");
  });

  it("does nothing for a client with no listing yet", async () => {
    vi.mocked(findListingPlacement).mockResolvedValue(null);
    for (const action of [giveClientVerifiedAction, giveClientTrustedAction, removeClientTrustedAction]) {
      await expect(action(form({ businessId: BUSINESS }))).rejects.toThrow(`redirect:/clients/${BUSINESS}?tags=no_listing#listing`);
    }
    expect(trustDirectoryBusiness).not.toHaveBeenCalled();
    expect(setDirectoryTrusted).not.toHaveBeenCalled();
    expect(upsertDirectoryVerification).not.toHaveBeenCalled();
  });

  it("refuses an id that is not one", async () => {
    await expect(giveClientTrustedAction(form({ businessId: "not-an-id" }))).rejects.toThrow("must be a valid id");
    expect(trustDirectoryBusiness).not.toHaveBeenCalled();
  });
});
