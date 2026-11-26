import { findBusinessAlertDetails, listReceiptsForBusiness, type Receipt } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { generateSetPasswordUrl } from "@/lib/auth";
import { paymentEmailDeps } from "./payment-emails";
import { renderReceiptsPdf } from "./receipt-pdf";

vi.mock("server-only", () => ({}));
// The shared sender pulls in the push sender, whose package is not installed in every checkout; this file tests only the app's deps.
vi.mock("@brandbasket/shared/server/payment-emails", () => ({ sendPaymentReceipt: vi.fn() }));
vi.mock("@/features/server-common/email", () => ({ customerEmailTransport: vi.fn(() => ({ send: vi.fn() })) }));
vi.mock("@/lib/auth", () => ({ generateSetPasswordUrl: vi.fn(), SET_PASSWORD_LIFETIME_SECONDS: 259_200 }));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.brandbasket.in" }) }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({})) }));
vi.mock("./receipt-pdf", () => ({ renderReceiptsPdf: vi.fn(async () => new Uint8Array([37, 80, 68, 70])) }));
vi.mock("../rules/receipt-document", () => ({
  isDownloadableReceipt: (receipt: { status: string }) => receipt.status !== "failed",
  receiptDocument: vi.fn((_receipt: unknown, customer: { businessName: string }) => ({ fileName: `receipt-${customer.businessName}.pdf` })),
}));
vi.mock("@brandbasket/db", async () => ({
  ...(await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db")),
  findBusinessAlertDetails: vi.fn(),
  listReceiptsForBusiness: vi.fn(),
}));

const PAYMENT = { id: "pay-1", businessId: "biz-1" };

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(findBusinessAlertDetails).mockResolvedValue({ business: { name: "Shah Sweets" }, owner: { email: "owner@example.com" } } as unknown as Awaited<ReturnType<typeof findBusinessAlertDetails>>);
});

describe("paymentEmailDeps", () => {
  it("makes a receipt PDF attachment named as the download names it", async () => {
    vi.mocked(listReceiptsForBusiness).mockResolvedValue([{ id: "pay-1", status: "paid" } as unknown as Receipt]);
    const attachment = await paymentEmailDeps().renderReceiptPdf?.(PAYMENT);
    expect(attachment).toEqual({ name: "receipt-Shah Sweets.pdf", content: new Uint8Array([37, 80, 68, 70]) });
    expect(renderReceiptsPdf).toHaveBeenCalledTimes(1);
  });

  it("makes no attachment when the payment has no downloadable receipt", async () => {
    vi.mocked(listReceiptsForBusiness).mockResolvedValue([{ id: "pay-1", status: "failed" } as unknown as Receipt, { id: "other", status: "paid" } as unknown as Receipt]);
    await expect(paymentEmailDeps().renderReceiptPdf?.(PAYMENT)).resolves.toBeNull();
  });

  it("gives a set-password block lasting three days, or none for an account with a password", async () => {
    vi.mocked(generateSetPasswordUrl).mockResolvedValueOnce("https://app.brandbasket.in/reset-password/t");
    await expect(paymentEmailDeps().setPassword?.("owner@example.com")).resolves.toEqual({ url: "https://app.brandbasket.in/reset-password/t", lifetimeDays: 3 });
    vi.mocked(generateSetPasswordUrl).mockResolvedValueOnce(null);
    await expect(paymentEmailDeps().setPassword?.("owner@example.com")).resolves.toBeNull();
  });
});
