import { beforeEach, describe, expect, it, vi } from "vitest";
import { verifyBusinessAction } from "@/app/app-host/(protected)/business/actions";
import { confirmOwnerVerification, requestOwnerVerification } from "@/lib/server/owner-verification";
import type { VerifyBusinessState } from "./verify-business-form";

vi.mock("server-only", () => ({}));
vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: async () => ({ tenant: { businessId: "business" } }), LISTING_PAGE_PATH: "/business" }));
vi.mock("@/lib/server/owner-verification", () => ({ confirmOwnerVerification: vi.fn(), requestOwnerVerification: vi.fn() }));
vi.mock("@/lib/server/geo-catalog", () => ({}));
vi.mock("@/lib/server/google-import-cookie", () => ({}));
vi.mock("@/lib/server/db", () => ({}));
vi.mock("@fynix/shared/server/media-storage", () => ({}));
vi.mock("@/lib/server/listing-pictures", () => ({}));
vi.mock("@/lib/server/listing-videos", () => ({}));
vi.mock("@/lib/server/business-profile", () => ({}));

const sent: Extract<VerifyBusinessState, { status: "sent" }> = {
  status: "sent", otpId: "11111111-1111-1111-1111-111111111111", phoneHint: "••••4321", texted: true,
};

function form(intent = "confirm"): FormData {
  const data = new FormData();
  data.set("intent", intent);
  data.set("otpId", sent.otpId);
  data.set("code", "123456");
  return data;
}

beforeEach(() => vi.resetAllMocks());

describe("owner verification action", () => {
  it("resends through the normal session-bound rate-limited request despite the code field", async () => {
    vi.mocked(requestOwnerVerification).mockResolvedValue({ kind: "sent", ...sent, otpId: "22222222-2222-2222-2222-222222222222" });
    expect(await verifyBusinessAction(sent, form("resend"))).toMatchObject({ status: "sent", phoneHint: sent.phoneHint });
    expect(requestOwnerVerification).toHaveBeenCalledOnce();
    expect(confirmOwnerVerification).not.toHaveBeenCalled();
  });
  it("preserves the returned destination after a wrong code or failed resend", async () => {
    vi.mocked(confirmOwnerVerification).mockResolvedValue({ kind: "wrong_code", triesLeft: 2 });
    expect(await verifyBusinessAction(sent, form())).toMatchObject({ status: "error", step: { otpId: sent.otpId, phoneHint: sent.phoneHint } });
    vi.mocked(requestOwnerVerification).mockResolvedValue({ kind: "unavailable" });
    expect(await verifyBusinessAction(sent, form("resend"))).toMatchObject({ status: "error", step: { otpId: sent.otpId, phoneHint: sent.phoneHint } });
  });
  it("requires an existing matching challenge before confirming", async () => {
    expect(await verifyBusinessAction({ status: "idle" }, form())).toMatchObject({ status: "error", step: "send" });
    expect(confirmOwnerVerification).not.toHaveBeenCalled();
    const data = form();
    data.set("otpId", "22222222-2222-2222-2222-222222222222");
    expect(await verifyBusinessAction(sent, data)).toMatchObject({ status: "error", step: "send" });
    expect(confirmOwnerVerification).not.toHaveBeenCalled();
  });
});
