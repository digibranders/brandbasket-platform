import type { Database, ScopedTransaction } from "@fynix/db";
import { setOwnDirectoryPromotionVisible, updateOwnListingContent, withTenantScope } from "@fynix/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PanelFormState } from "@/lib/panel-form-state";
import { paidCustomerOrNull, PAID_PLAN_REQUIRED_MESSAGE } from "@/lib/server/blog-access";
import type { GrantedCustomer } from "@/lib/server/customer-access";
import { redirectForChargePayment } from "@/lib/server/charge-redirect";
import { getAppDb } from "@/lib/server/db";
import { startListingPromotionPayment } from "@/lib/server/listing-promotion";
import { GENERIC_ERROR_MESSAGE } from "@/lib/server/panel-form-errors";
import {
  payListingPromotionAction,
  saveListingAboutAction,
  saveListingButtonsAction,
  saveListingTagsAction,
  setListingPromotionVisibleAction,
  setListingVisibleAction,
} from "./actions";
import { LISTING_MISSING_MESSAGE } from "./errors";

/*
 * Same shape as details/actions.test.ts: paidCustomerOrNull, withTenantScope and the packages/db query are doubles,
 * while the actions' own control flow (which error wins, when a write happens, when the page revalidates) and the
 * shared form parsers run for real.
 */
vi.mock("@/lib/server/report-panel-error", () => ({ reportUnexpectedPanelError: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new RedirectSignal(url);
  }),
}));
vi.mock("@/lib/server/charge-redirect", () => ({
  redirectForChargePayment: vi.fn(() => {
    throw new RedirectSignal("payment");
  }),
}));
vi.mock("@/lib/server/listing-promotion", () => ({ startListingPromotionPayment: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn() }));
vi.mock("@/lib/server/blog-access", () => ({
  paidCustomerOrNull: vi.fn(),
  PAID_PLAN_REQUIRED_MESSAGE: "This opens once your plan is paid. You can pay from Billing.",
}));
vi.mock("@fynix/db", async (importOriginal) => {
  // hasPostgresCode/CHECK_VIOLATION are real: panel-form-errors.ts uses them to tell a check violation apart.
  const actual = await importOriginal<typeof import("@fynix/db")>();
  return {
    hasPostgresCode: actual.hasPostgresCode,
    CHECK_VIOLATION: actual.CHECK_VIOLATION,
    setOwnDirectoryPromotionVisible: vi.fn(),
    updateOwnListingContent: vi.fn(),
    withTenantScope: vi.fn(),
  };
});

/** What the redirect doubles throw, as Next's own redirect() does, so the action stops there. */
class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}

async function redirectOf(action: Promise<void>): Promise<string> {
  try {
    await action;
  } catch (error) {
    if (error instanceof RedirectSignal) return error.url;
    throw error;
  }
  throw new Error("The action finished without redirecting");
}

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const appDb = { name: "app-db" } as unknown as Database;
const appTx = { name: "app-tx" } as unknown as ScopedTransaction;
const IDLE: PanelFormState = { status: "idle" };

function granted(): GrantedCustomer {
  return {
    user: { id: "user-1", email: "ana@example.com", name: "Ana Diaz" },
    tenant: { userId: "user-1", businessId: BUSINESS_ID, businessName: "Smile", role: "owner" },
    billing: { hasAccess: true },
  } as never;
}

function form(entries: readonly (readonly [string, string])[]): FormData {
  const data = new FormData();
  for (const [name, value] of entries) data.append(name, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAppDb).mockReturnValue(appDb);
  vi.mocked(paidCustomerOrNull).mockResolvedValue(granted());
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(appTx));
  vi.mocked(updateOwnListingContent).mockResolvedValue(true);
  vi.mocked(setOwnDirectoryPromotionVisible).mockResolvedValue(1);
});

describe("listing actions", () => {
  it("refuses an unpaid business before touching the database", async () => {
    vi.mocked(paidCustomerOrNull).mockResolvedValue(null);
    const state = await saveListingAboutAction(IDLE, form([["about", "Hello"]]));
    expect(state).toMatchObject({ status: "error", message: PAID_PLAN_REQUIRED_MESSAGE });
    expect(withTenantScope).not.toHaveBeenCalled();
  });

  it("returns the field error without writing", async () => {
    const state = await saveListingAboutAction(IDLE, form([["about", "Call 9820012345"]]));
    expect(state).toMatchObject({ status: "error", field: "about" });
    expect(updateOwnListingContent).not.toHaveBeenCalled();
  });

  it("saves about, then revalidates the page", async () => {
    const state = await saveListingAboutAction(IDLE, form([["about", "Gentle family dentistry."]]));
    expect(state).toEqual({ status: "saved" });
    expect(updateOwnListingContent).toHaveBeenCalledWith(
      appTx,
      { about: "Gentle family dentistry." },
      expect.any(Date),
    );
    expect(revalidatePath).toHaveBeenCalledWith("/listing");
  });

  it("saves tags, buttons and visibility", async () => {
    await saveListingTagsAction(IDLE, form([["tag", "Braces"], ["tag", "Root canal"]]));
    expect(updateOwnListingContent).toHaveBeenLastCalledWith(
      appTx,
      { tags: ["Braces", "Root canal"] },
      expect.any(Date),
    );

    await saveListingButtonsAction(IDLE, form([["call", "on"]]));
    expect(updateOwnListingContent).toHaveBeenLastCalledWith(
      appTx,
      { buttons: { call: true, whatsapp: false, book: false, directions: false, website: false } },
      expect.any(Date),
    );

    await setListingVisibleAction(IDLE, form([["visible", "off"]]));
    expect(updateOwnListingContent).toHaveBeenLastCalledWith(appTx, { visible: false }, expect.any(Date));
  });

  it("says so when there is no listing to save into", async () => {
    vi.mocked(updateOwnListingContent).mockResolvedValue(false);
    const state = await saveListingAboutAction(IDLE, form([["about", "Hello"]]));
    expect(state).toMatchObject({ status: "error", message: LISTING_MISSING_MESSAGE });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("turns an unexpected failure into the generic message without revalidating", async () => {
    vi.mocked(updateOwnListingContent).mockRejectedValue(new Error("connection reset"));
    const state = await setListingVisibleAction(IDLE, form([["visible", "on"]]));
    expect(state).toMatchObject({ status: "error", message: GENERIC_ERROR_MESSAGE });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});

describe("promotion actions", () => {
  it("sends an unpaid business back with a notice, opening nothing", async () => {
    vi.mocked(paidCustomerOrNull).mockResolvedValue(null);
    expect(await redirectOf(payListingPromotionAction(form([["tag", "hot_new"]])))).toBe(
      "/listing?promotion=payment-required#promotion",
    );
    expect(startListingPromotionPayment).not.toHaveBeenCalled();
  });

  it("refuses a tag that is not one of the three", async () => {
    expect(await redirectOf(payListingPromotionAction(form([["tag", "featured_gold"]])))).toBe(
      "/listing?promotion=invalid-tag#promotion",
    );
    expect(startListingPromotionPayment).not.toHaveBeenCalled();
  });

  it("opens the payment for the chosen tag", async () => {
    const started = { kind: "redirect", url: "/billing/charges/confirm?token=t" } as const;
    vi.mocked(startListingPromotionPayment).mockResolvedValue(started);

    expect(await redirectOf(payListingPromotionAction(form([["tag", "most_searched"]])))).toBe("payment");
    expect(startListingPromotionPayment).toHaveBeenCalledWith(granted(), "most_searched", expect.any(Date));
    expect(redirectForChargePayment).toHaveBeenCalledWith(started);
  });

  it("explains a refusal from the one-tag rule", async () => {
    vi.mocked(startListingPromotionPayment).mockResolvedValue({ kind: "refused", reason: "other-tag-running" });
    expect(await redirectOf(payListingPromotionAction(form([["tag", "hot_new"]])))).toBe(
      "/listing?promotion=other-tag-running#promotion",
    );
    expect(redirectForChargePayment).not.toHaveBeenCalled();
  });

  it("switches the tag off and on through the customer's own scope", async () => {
    expect(await setListingPromotionVisibleAction(IDLE, form([["visible", "off"]]))).toEqual({ status: "saved" });
    expect(setOwnDirectoryPromotionVisible).toHaveBeenLastCalledWith(appTx, false, expect.any(Date));
    expect(revalidatePath).toHaveBeenCalledWith("/listing");

    await setListingPromotionVisibleAction(IDLE, form([["visible", "on"]]));
    expect(setOwnDirectoryPromotionVisible).toHaveBeenLastCalledWith(appTx, true, expect.any(Date));
  });

  it("refuses the switch for an unpaid business", async () => {
    vi.mocked(paidCustomerOrNull).mockResolvedValue(null);
    const state = await setListingPromotionVisibleAction(IDLE, form([["visible", "off"]]));
    expect(state).toMatchObject({ status: "error", message: PAID_PLAN_REQUIRED_MESSAGE });
    expect(setOwnDirectoryPromotionVisible).not.toHaveBeenCalled();
  });
});
