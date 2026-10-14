import { saveBillingProfile } from "@fynix/db";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { issueClientMissingInvoice } from "@/lib/server/invoices-admin";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { logStaffAccess } from "@/lib/server/staff-access-log";
import { issueMissingInvoiceAction, saveClientBillingDetailsAction } from "./invoice-actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@fynix/db", async () => {
  const actual = await vi.importActual<typeof import("@fynix/db")>("@fynix/db");
  return { ...actual, saveBillingProfile: vi.fn() };
});
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/staff-access-log", () => ({ logStaffAccess: vi.fn() }));
vi.mock("@/lib/server/invoices-admin", () => ({ issueClientMissingInvoice: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const PAYMENT = "01a0f71b-8402-7d48-a90a-207e8c8a8999";
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "finance" } } as unknown as GrantedStaff;
const SUPPORT_STAFF = { user: { id: "staff-2" }, staff: { userId: "staff-2", role: "support" } } as unknown as GrantedStaff;
const IDLE = { status: "idle" } as const;

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

function detailsForm(overrides: Record<string, string> = {}): FormData {
  return form({
    businessId: BUSINESS,
    legalName: "Riverside Dental LLP",
    gstin: "",
    addressLine1: "12 MG Road",
    addressLine2: "",
    city: "Mumbai",
    postalCode: "400080",
    stateCode: "mh",
    email: "",
    phoneCountry: "IN",
    phone: "",
    ...overrides,
  });
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.spyOn(console, "info").mockImplementation(() => undefined);
});

describe("issueMissingInvoiceAction", () => {
  it("is refused for a session that is not staff's, before anything is read", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(issueMissingInvoiceAction(form({ businessId: BUSINESS, paymentId: PAYMENT }))).rejects.toThrow("NEXT_REDIRECT");
    expect(issueClientMissingInvoice).not.toHaveBeenCalled();
  });

  it("issues the invoice dated now, refreshes the pages that list it, and shows the outcome on the Tax invoices section", async () => {
    vi.mocked(issueClientMissingInvoice).mockResolvedValue("issued");
    await issueMissingInvoiceAction(form({ businessId: BUSINESS, paymentId: PAYMENT }));

    expect(issueClientMissingInvoice).toHaveBeenCalledWith(BUSINESS, PAYMENT, expect.any(Date), "staff-1");
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
    expect(revalidatePath).toHaveBeenCalledWith("/invoices");
    expect(redirect).toHaveBeenCalledWith(`/clients/${BUSINESS}?invoice=issued#tax-invoices`);
  });

  it("shows a refusal as its notice", async () => {
    vi.mocked(issueClientMissingInvoice).mockResolvedValue("mismatch");
    await issueMissingInvoiceAction(form({ businessId: BUSINESS, paymentId: PAYMENT }));
    expect(redirect).toHaveBeenCalledWith(`/clients/${BUSINESS}?invoice=mismatch#tax-invoices`);
  });

  it("throws on an id that is not one, issuing nothing", async () => {
    await expect(issueMissingInvoiceAction(form({ businessId: "nope", paymentId: PAYMENT }))).rejects.toThrow("must be a valid id");
    await expect(issueMissingInvoiceAction(form({ businessId: BUSINESS, paymentId: "1; drop table payments" }))).rejects.toThrow("must be a valid id");
    await expect(issueMissingInvoiceAction(form({ businessId: BUSINESS }))).rejects.toThrow("must be a valid id");
    expect(issueClientMissingInvoice).not.toHaveBeenCalled();
  });
});

describe("saveClientBillingDetailsAction", () => {
  it("is refused for a session that is not staff's, before anything is read", async () => {
    vi.mocked(requireStaffAccess).mockRejectedValue(new Error("NEXT_REDIRECT"));
    await expect(saveClientBillingDetailsAction(IDLE, detailsForm())).rejects.toThrow("NEXT_REDIRECT");
    expect(saveBillingProfile).not.toHaveBeenCalled();
  });

  it("saves every column for the page's business on the staff connection and refreshes the page", async () => {
    expect(await saveClientBillingDetailsAction(IDLE, detailsForm({ gstin: "27AAPFU0939F1ZV" }))).toEqual({ status: "saved" });
    expect(saveBillingProfile).toHaveBeenCalledWith(
      { name: "staff-db" },
      {
        businessId: BUSINESS,
        legalName: "Riverside Dental LLP",
        gstin: "27AAPFU0939F1ZV",
        addressLine1: "12 MG Road",
        addressLine2: null,
        city: "Mumbai",
        postalCode: "400080",
        stateCode: "mh",
        email: null,
        phone: null,
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith(`/clients/${BUSINESS}`);
  });

  it("logs who changed the details, for which business, and none of the values", async () => {
    await saveClientBillingDetailsAction(IDLE, detailsForm({ gstin: "27AAPFU0939F1ZV", email: "owner@riverside.example" }));

    const lines = vi.mocked(console.info).mock.calls.map(([line]) => String(line));
    expect(lines).toHaveLength(1);
    expect(lines[0]).toContain("billing-details-saved-by-staff");
    expect(JSON.parse(lines[0]?.slice(lines[0].indexOf("{")) ?? "")).toEqual({
      event: "billing-details-saved-by-staff",
      businessId: BUSINESS,
      savedBy: "staff-1",
    });
    expect(lines[0]).not.toMatch(/Riverside|27AAPFU0939F1ZV|MG Road|Mumbai|400080|owner@/);
  });

  it("logs nothing when the form is refused", async () => {
    await saveClientBillingDetailsAction(IDLE, detailsForm({ city: "" }));
    expect(console.info).not.toHaveBeenCalled();
  });

  it("hands back the first problem on its field with everything typed, and saves nothing", async () => {
    const state = await saveClientBillingDetailsAction(IDLE, detailsForm({ postalCode: "4000", city: "" }));
    expect(state).toMatchObject({
      status: "error",
      field: "city",
      message: "Enter the city, in English letters.",
      values: { businessId: BUSINESS, postalCode: "4000", legalName: "Riverside Dental LLP" },
    });
    expect(saveBillingProfile).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("refuses a GSTIN from another state on the State field", async () => {
    const state = await saveClientBillingDetailsAction(IDLE, detailsForm({ gstin: "27AAPFU0939F1ZV", stateCode: "ka" }));
    expect(state).toMatchObject({ status: "error", field: "stateCode" });
    expect(saveBillingProfile).not.toHaveBeenCalled();
  });

  it("throws on a form that does not name the page's business", async () => {
    await expect(saveClientBillingDetailsAction(IDLE, detailsForm({ businessId: "nope" }))).rejects.toThrow("must be a valid id");
    expect(saveBillingProfile).not.toHaveBeenCalled();
  });
});

describe("billing actions need the finance role", () => {
  beforeEach(() => {
    vi.mocked(requireStaffAccess).mockResolvedValue(SUPPORT_STAFF);
    vi.mocked(redirect).mockImplementation((url: string) => {
      throw new Error(`redirect:${url}`);
    });
  });

  // An empty form on purpose: the role check comes before the form is read, and nothing is touched.
  it.each([
    ["issueMissingInvoiceAction", (data: FormData) => issueMissingInvoiceAction(data)],
    ["saveClientBillingDetailsAction", (data: FormData) => saveClientBillingDetailsAction(IDLE, data)],
  ])("%s sends support staff to the no-access page and records the refusal", async (_name, run) => {
    await expect(run(form({}))).rejects.toThrow("redirect:/no-access");
    expect(logStaffAccess).toHaveBeenCalledWith({ staffUserId: "staff-2", action: "access.denied", targetType: "money", result: "denied" });
    expect(issueClientMissingInvoice).not.toHaveBeenCalled();
    expect(saveBillingProfile).not.toHaveBeenCalled();
  });
});
