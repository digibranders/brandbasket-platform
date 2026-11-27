import { beforeEach, describe, expect, it, vi } from "vitest";
import { createPaymentLinkFor } from "@/lib/server/payment-links-admin";
import { requireStaffCan } from "@/lib/server/staff-role";
import { createPaymentLinkAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/staff-role", () => ({ requireStaffCan: vi.fn() }));
vi.mock("@/lib/server/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.brandbasket.in" }) }));
vi.mock("@/lib/server/payment-links-admin", () => ({ createPaymentLinkFor: vi.fn() }));

const LEAD = "0194b0a0-0000-7000-8000-0000000000a1";
const DENIED = new Error("redirect:/no-access");
const STAFF = { user: { id: "staff-1" } };
const NOBODY = { leadId: null, businessId: null } as const;

function form(extra: Record<string, string> = {}): FormData {
  const data = new FormData();
  const values: Record<string, string> = { countryCode: "IN", websiteKind: "b2b", billingInterval: "month", dealType: "paid", buildPrice: "35000", discountKind: "none", advanceKind: "amount", advanceValue: "10000", businessName: "Rao Dental", ...extra };
  for (const [name, value] of Object.entries(values)) data.set(name, value);
  data.append("service", "managed-website");
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("createPaymentLinkAction", () => {
  it("is refused for staff without the money capability, before the form is read", async () => {
    vi.mocked(requireStaffCan).mockRejectedValue(DENIED);
    await expect(createPaymentLinkAction(NOBODY, { status: "idle" }, form())).rejects.toBe(DENIED);
    expect(requireStaffCan).toHaveBeenCalledWith("money");
    expect(createPaymentLinkFor).not.toHaveBeenCalled();
  });

  it("answers a form the rules refuse with the message and every typed answer, and makes nothing", async () => {
    vi.mocked(requireStaffCan).mockResolvedValue(STAFF as never);
    const state = await createPaymentLinkAction(NOBODY, { status: "idle" }, form({ discountKind: "amount", discountValue: "500" }));
    expect(state).toMatchObject({ status: "error", field: "setupFeeNote", values: { businessName: "Rao Dental", discountValue: "500", service: ["managed-website"] } });
    expect(createPaymentLinkFor).not.toHaveBeenCalled();
  });

  it("passes the enquiry the page was opened for and shows the address once", async () => {
    vi.mocked(requireStaffCan).mockResolvedValue(STAFF as never);
    vi.mocked(createPaymentLinkFor).mockResolvedValue({
      kind: "created",
      token: "T".repeat(43),
      link: { businessName: "Rao Dental", contactName: null, email: null, expiresAt: new Date("2026-12-04T10:00:00.000Z") },
    } as never);
    const state = await createPaymentLinkAction({ leadId: LEAD, businessId: null }, { status: "idle" }, form());
    expect(createPaymentLinkFor).toHaveBeenCalledWith(expect.objectContaining({ leadId: LEAD, businessId: null, staff: STAFF, form: expect.objectContaining({ websiteKind: "b2b", setupFeeListCents: 3_500_000, advanceCents: 1_000_000, dealType: "paid" }) }));
    expect(state).toEqual({ status: "created", address: `https://app.brandbasket.in/pay/${"T".repeat(43)}`, customer: "Rao Dental", expiresAt: "2026-12-04T10:00:00.000Z" });
  });

  it("returns the server's refusal with the typed answers", async () => {
    vi.mocked(requireStaffCan).mockResolvedValue(STAFF as never);
    vi.mocked(createPaymentLinkFor).mockResolvedValue({ kind: "refused", field: "couponId", message: "That coupon has expired." });
    expect(await createPaymentLinkAction(NOBODY, { status: "idle" }, form())).toMatchObject({ status: "error", field: "couponId", message: "That coupon has expired." });
  });

  it("drops an origin id that is not an id", async () => {
    vi.mocked(requireStaffCan).mockResolvedValue(STAFF as never);
    vi.mocked(createPaymentLinkFor).mockResolvedValue({ kind: "refused", field: null, message: "x" });
    await createPaymentLinkAction({ leadId: "nope", businessId: null }, { status: "idle" }, form());
    expect(createPaymentLinkFor).toHaveBeenCalledWith(expect.objectContaining({ leadId: null }));
  });
});
