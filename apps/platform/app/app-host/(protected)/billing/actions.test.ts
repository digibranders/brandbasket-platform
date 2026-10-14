import { findBillingProfile, findPincode, saveBillingProfile, withTenantScope } from "@firstfold/db";
import { refresh } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { GENERIC_ERROR_MESSAGE } from "@/lib/server/panel-form-errors";
import { lookupBillingPincodeAction, saveBillingDetailsAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ refresh: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: () => ({ name: "app-db" }) }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/charges", () => ({ startCustomerChargePayment: vi.fn() }));
vi.mock("@/lib/server/checkout", () => ({ startReactivationFor: vi.fn() }));
vi.mock("@/lib/server/charge-redirect", () => ({ redirectForChargePayment: vi.fn() }));
vi.mock("@firstfold/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@firstfold/db")>()),
  findBillingProfile: vi.fn(),
  findPincode: vi.fn(),
  saveBillingProfile: vi.fn(),
  withTenantScope: vi.fn((_db: unknown, _tenant: unknown, work: (tx: unknown) => unknown) => work({ name: "app-tx" })),
}));

const TENANT = {
  userId: "user-1",
  businessId: "0192f3c4-1111-7000-8000-000000000001",
  businessName: "Riverside",
  role: "owner",
};

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  const defaults = {
    addressLine1: "12 MG Road",
    addressLine2: "",
    city: "Mumbai",
    postalCode: "400080",
    stateCode: "mh",
  };
  for (const [key, value] of Object.entries({ ...defaults, ...fields })) data.set(key, value);
  return data;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant: TENANT } as never);
  vi.mocked(findBillingProfile).mockResolvedValue(null);
  vi.mocked(findPincode).mockResolvedValue({
    pincode: "400080",
    stateCode: "mh",
    districtSlug: "mumbai",
    districtName: "Mumbai",
    localities: [],
  });
});

const REGISTERED = { hasGstin: "on", gstin: "27AAPFU0939F1ZV", legalName: "Riverside Dental LLP" };

describe("saveBillingDetailsAction", () => {
  it("lets a listing account and one still buying its membership save its own details", async () => {
    await saveBillingDetailsAction({ status: "idle" }, form({}));
    expect(requireCustomerAccess).toHaveBeenCalledWith({ listingAccount: "allow", membershipCheckout: "allow" });
  });

  it("saves the details for the signed-in business, through its tenant scope, and refreshes the page", async () => {
    expect(await saveBillingDetailsAction({ status: "idle" }, form(REGISTERED))).toEqual({ status: "saved" });
    expect(withTenantScope).toHaveBeenCalledWith({ name: "app-db" }, TENANT, expect.any(Function));
    expect(saveBillingProfile).toHaveBeenCalledWith(
      { name: "app-tx" },
      expect.objectContaining({
        businessId: TENANT.businessId,
        legalName: "Riverside Dental LLP",
        gstin: "27AAPFU0939F1ZV",
        addressLine2: null,
        stateCode: "mh",
      }),
    );
    expect(refresh).toHaveBeenCalled();
  });

  it("bills the business's own name when the customer has no GSTIN, saving every column so nothing earlier lingers", async () => {
    await saveBillingDetailsAction({ status: "idle" }, form({}));
    expect(vi.mocked(saveBillingProfile).mock.calls[0]?.[1]).toEqual({
      businessId: TENANT.businessId,
      legalName: "Riverside",
      gstin: null,
      addressLine1: "12 MG Road",
      addressLine2: null,
      city: "Mumbai",
      postalCode: "400080",
      stateCode: "mh",
      email: null,
      phone: null,
    });
  });

  it("keeps the billing contact that was saved before, since this form has no fields for it", async () => {
    vi.mocked(findBillingProfile).mockResolvedValue({ email: "accounts@riverside.in", phone: "+919820012345" } as never);
    await saveBillingDetailsAction({ status: "idle" }, form({}));
    expect(vi.mocked(saveBillingProfile).mock.calls[0]?.[1]).toMatchObject({ email: "accounts@riverside.in", phone: "+919820012345" });
  });

  it("keeps a legal name that was saved without a GSTIN, but not one that came with a GSTIN now given up", async () => {
    vi.mocked(findBillingProfile).mockResolvedValue({ legalName: "Riverside Dental LLP", gstin: null, email: null, phone: null } as never);
    await saveBillingDetailsAction({ status: "idle" }, form({}));
    expect(vi.mocked(saveBillingProfile).mock.calls[0]?.[1]).toMatchObject({ legalName: "Riverside Dental LLP", gstin: null });

    vi.mocked(findBillingProfile).mockResolvedValue({ legalName: "Registered Name Pvt Ltd", gstin: "27AAPFU0939F1ZV", email: null, phone: null } as never);
    await saveBillingDetailsAction({ status: "idle" }, form({}));
    expect(vi.mocked(saveBillingProfile).mock.calls[1]?.[1]).toMatchObject({ legalName: "Riverside", gstin: null });
  });

  it("takes the state from the GSTIN and does not hold it to the pincode's state", async () => {
    await saveBillingDetailsAction({ status: "idle" }, form({ ...REGISTERED, stateCode: "ka" }));
    expect(vi.mocked(saveBillingProfile).mock.calls[0]?.[1]).toMatchObject({ stateCode: "mh" });
    expect(findPincode).not.toHaveBeenCalled();
  });

  it("hands back the first problem on its field, with what was typed, and saves nothing", async () => {
    const state = await saveBillingDetailsAction({ status: "idle" }, form({ postalCode: "4000", city: "" }));
    expect(state).toMatchObject({
      status: "error",
      field: "city",
      message: "Enter the city, in English letters.",
      values: { postalCode: "4000" },
    });
    expect(saveBillingProfile).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("refuses a state that is not the pincode's, on the State field, and keeps what was typed", async () => {
    const state = await saveBillingDetailsAction({ status: "idle" }, form({ stateCode: "ka" }));
    expect(state).toMatchObject({
      status: "error",
      field: "stateCode",
      message: "This pincode is in Maharashtra. Choose Maharashtra, or check the pincode.",
      values: { stateCode: "ka", postalCode: "400080" },
    });
    expect(saveBillingProfile).not.toHaveBeenCalled();
  });

  it("lets a pincode the directory does not list through, since it may be new", async () => {
    vi.mocked(findPincode).mockResolvedValue(null);
    expect(await saveBillingDetailsAction({ status: "idle" }, form({ postalCode: "999999" }))).toEqual({ status: "saved" });
  });

  it("refuses a GSTIN that is not valid on its own field", async () => {
    const state = await saveBillingDetailsAction({ status: "idle" }, form({ ...REGISTERED, gstin: "29AAPFU0939F1ZV" }));
    expect(state).toMatchObject({ status: "error", field: "gstin" });
    expect(saveBillingProfile).not.toHaveBeenCalled();
  });

  it("answers with a plain message, saves nothing and does not refresh when the write fails", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(saveBillingProfile).mockRejectedValueOnce(new Error("connection reset"));
    const state = await saveBillingDetailsAction({ status: "idle" }, form({}));
    expect(state).toMatchObject({ status: "error", message: GENERIC_ERROR_MESSAGE, field: null });
    expect(refresh).not.toHaveBeenCalled();
  });

  it("logs only the error's name and Postgres code when the write fails, never its message", async () => {
    const logged = vi.spyOn(console, "error").mockImplementation(() => undefined);
    // Drizzle puts the failed query's params in the message, so the message can hold the legal name and address.
    const failure = Object.assign(new Error("insert failed, params: Riverside Dental LLP, 12 MG Road"), { code: "23514" });
    vi.mocked(saveBillingProfile).mockRejectedValueOnce(failure);

    await saveBillingDetailsAction({ status: "idle" }, form({}));

    expect(logged).toHaveBeenCalledTimes(1);
    expect(logged).toHaveBeenCalledWith("[billing] saveBillingDetailsAction failed", { errorName: "Error", pgCode: "23514" });
    expect(JSON.stringify(logged.mock.calls)).not.toContain("Riverside");
  });

  it("saves nothing when the customer may not use Billing", async () => {
    vi.mocked(requireCustomerAccess).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));

    await expect(saveBillingDetailsAction({ status: "idle" }, form({}))).rejects.toThrow("NEXT_REDIRECT");

    expect(saveBillingProfile).not.toHaveBeenCalled();
    expect(withTenantScope).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });
});

describe("lookupBillingPincodeAction", () => {
  it("names the state and district of a pincode in India Post's directory", async () => {
    expect(await lookupBillingPincodeAction("400 080")).toEqual({ kind: "found", stateCode: "mh", stateName: "Maharashtra", district: "Mumbai" });
    expect(findPincode).toHaveBeenCalledWith({ name: "app-db" }, "400080");
  });

  it("finds nothing for a pincode the directory does not list", async () => {
    vi.mocked(findPincode).mockResolvedValue(null);
    expect(await lookupBillingPincodeAction("999999")).toEqual({ kind: "not-found" });
  });

  it("does not ask the database about something that cannot be a pincode", async () => {
    expect(await lookupBillingPincodeAction("x".repeat(500))).toEqual({ kind: "not-found" });
    expect(findPincode).not.toHaveBeenCalled();
  });

  it("needs a signed-in customer", async () => {
    vi.mocked(requireCustomerAccess).mockRejectedValueOnce(new Error("NEXT_REDIRECT"));
    await expect(lookupBillingPincodeAction("400080")).rejects.toThrow("NEXT_REDIRECT");
    expect(findPincode).not.toHaveBeenCalled();
  });
});
