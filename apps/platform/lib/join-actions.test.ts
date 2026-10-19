import { beforeEach, expect, it, vi } from "vitest";
import { joinForListing } from "@/app/app-host/login/actions";
import { BRAND, type Brand } from "@/lib/brand";
import { LISTING_BRAND } from "@/lib/testing/listing-brand";
import { requestJoinCode, createListingAccount } from "@/lib/server/listing-account";

const host: { brand: Brand } = { brand: LISTING_BRAND };

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/request-brand", () => ({ requestBrand: async () => host.brand }));
vi.mock("@/lib/server/listing-account", () => ({ requestJoinCode: vi.fn(), createListingAccount: vi.fn() }));
vi.mock("@/lib/server/sign-in", () => ({ signInWithPassword: vi.fn() }));
vi.mock("@/lib/server/affiliate-access", () => ({ landingForSignedInUser: vi.fn() }));
vi.mock("@/lib/server/customer-access", () => ({ LISTING_PAGE_PATH: "/business" }));

const otp = { otpId: "existing-challenge", emailHint: "o•••@example.test", confirmRequired: true };
function form(code: boolean): FormData {
  const result = new FormData();
  for (const [key, value] of Object.entries({ choice: "listing_only", name: "Owner", email: "Owner@Example.test", password: "long-password-9", country: "IN", stateCode: "mh", agree: "yes", otpId: otp.otpId })) {
    result.set(key, value);
  }
  if (code) result.set("code", "123456");
  else result.set("resend", "1");
  return result;
}
beforeEach(() => {
  vi.clearAllMocks();
  host.brand = LISTING_BRAND;
});

it("retains a signup challenge and server send retry when resend is blocked", async () => {
  vi.mocked(requestJoinCode).mockResolvedValue({ kind: "limited", scope: "email", retryAfterSeconds: 137 });
  expect(await joinForListing({ status: "code", otp }, form(false))).toMatchObject({
    status: "error", otp, retry: { scope: "email", operation: "send", retryAfterSeconds: 137 },
  });
  expect(createListingAccount).not.toHaveBeenCalled();
});

it("retains signup confirmation retry instead of redirecting as a created account", async () => {
  vi.mocked(createListingAccount).mockResolvedValue({ kind: "limited", scope: "network", retryAfterSeconds: 17 });
  expect(await joinForListing({ status: "code", otp }, form(true))).toMatchObject({
    status: "error", otp, retry: { scope: "network", operation: "confirm", retryAfterSeconds: 17 },
  });
  expect(requestJoinCode).not.toHaveBeenCalled();
});

/** A Brandbasket form: Managed Website, with the business's name. */
function brandbasketForm(entries: Record<string, string>): FormData {
  const result = new FormData();
  const base = { choice: "managed", businessName: "Smile Dental", name: "Owner", email: "Owner@Example.test", password: "long-password-9", country: "IN", stateCode: "mh", agree: "yes" };
  for (const [key, value] of Object.entries({ ...base, ...entries })) result.set(key, value);
  return result;
}
const emailOtp = { otpId: "email-challenge", emailHint: "o•••@example.test", confirmRequired: true };

it("refuses the free listing on the Brandbasket host, before any code is emailed or any account made", async () => {
  host.brand = BRAND;
  const result = await joinForListing({ status: "idle" }, brandbasketForm({ choice: "listing_only" }));
  expect(result).toMatchObject({ status: "error", message: "Choose a plan to continue." });
  expect(requestJoinCode).not.toHaveBeenCalled();
  expect(createListingAccount).not.toHaveBeenCalled();
});

it("refuses the retired plans on the Brandbasket host like any choice it never offered", async () => {
  host.brand = BRAND;
  for (const choice of ["care", "premium"]) {
    expect(await joinForListing({ status: "idle" }, brandbasketForm({ choice })), choice).toMatchObject({ status: "error", message: "Choose a plan to continue." });
  }
  expect(requestJoinCode).not.toHaveBeenCalled();
});

it("sends the code for Managed Website on the Brandbasket host, to the email address", async () => {
  host.brand = BRAND;
  vi.mocked(requestJoinCode).mockResolvedValue({ kind: "code", otp: emailOtp });
  expect(await joinForListing({ status: "idle" }, brandbasketForm({}))).toMatchObject({ status: "code", otp: emailOtp });
  expect(requestJoinCode).toHaveBeenCalledWith(expect.objectContaining({ choice: "managed", email: "owner@example.test", code: null }));
  expect(vi.mocked(requestJoinCode).mock.calls[0]?.[0]).not.toHaveProperty("phone");
});

it("asks a sign-up for an email address, and sends nothing without one, even when a number is posted", async () => {
  host.brand = BRAND;
  const data = brandbasketForm({ phone: "9820000000" });
  data.delete("email");
  expect(await joinForListing({ status: "idle" }, data)).toMatchObject({ status: "error", message: "Enter your email address." });
  expect(requestJoinCode).not.toHaveBeenCalled();
});

it("opens an account once the emailed code is confirmed, and goes on to pay for the plan", async () => {
  host.brand = BRAND;
  vi.mocked(createListingAccount).mockResolvedValue({ kind: "wrong-code", message: "That code isn't right. 4 tries left." });
  expect(await joinForListing({ status: "code", otp: emailOtp }, brandbasketForm({ otpId: emailOtp.otpId, code: "123456" }))).toMatchObject({
    status: "error", message: "That code isn't right. 4 tries left.", otp: emailOtp,
  });
  expect(createListingAccount).toHaveBeenCalledWith(expect.objectContaining({ email: "owner@example.test", code: { otpId: emailOtp.otpId, code: "123456" } }));
});
