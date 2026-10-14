import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeRateLimit,
  findListingOwner,
  insertDirectoryEnquiry,
  recordConsent,
  recordEmail,
  resolveDirectoryNamed,
  type Database,
  type DirectoryRef,
} from "@firstfold/db";
import { getStaffDb } from "./db";
import type { EnquiryInput } from "./directory-fields";
import { recordDirectoryEnquiry } from "./directory-enquiries";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.example.com" }) }));
vi.mock("@firstfold/db", () => ({
  consumeRateLimit: vi.fn(),
  findListingOwner: vi.fn(),
  insertDirectoryEnquiry: vi.fn(),
  recordConsent: vi.fn(),
  recordEmail: vi.fn(),
  resolveDirectoryNamed: vi.fn(),
}));

const NOW = new Date("2026-09-29T10:00:00.000Z");
const DB = {} as Database;
const ENQUIRY: EnquiryInput = {
  kind: "top_list",
  business: null,
  businessName: null,
  serviceLabel: "Dentists",
  areaLabel: "Thane",
  name: "Anita Rao",
  phone: "+919822222222",
  message: null,
};

afterEach(() => vi.unstubAllEnvs());

beforeEach(() => {
  vi.clearAllMocks();
  // The mail goes to the local outbox only on a local deployment; a server's own APP_ORIGIN would send it through Brevo.
  vi.stubEnv("VERCEL_ENV", "");
  vi.stubEnv("APP_ORIGIN", "http://app.localhost:3001");
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true, remaining: 1, retryAfterSeconds: 0 });
  vi.mocked(insertDirectoryEnquiry).mockResolvedValue("enquiry-1");
  vi.mocked(findListingOwner).mockResolvedValue(null);
  vi.mocked(resolveDirectoryNamed).mockResolvedValue(SMILE);
});

const KEY = "dentists/thane/naupada/smile-dental";
/** The place KEY is a legacy key of. */
const SMILE: DirectoryRef = { placeId: "k7m2q9a", listingKey: KEY };
const BUSINESS_ENQUIRY: EnquiryInput = {
  kind: "business",
  business: { by: "key", key: KEY },
  businessName: "Smile Dental",
  serviceLabel: "Dentists",
  areaLabel: "Naupada",
  name: "Anita Rao",
  phone: "+919822222222",
  message: "Do you do braces for kids?",
};
const OWNER = {
  businessId: "biz-1",
  account: "listing",
  businessName: "Smile Dental",
  ownerName: "Meera",
  ownerEmail: "meera@example.com",
  emailConfirmed: true,
} as const;

describe("telling the owner", () => {
  it("emails a business enquiry to the listing's owner, with how to call the visitor back", async () => {
    vi.mocked(findListingOwner).mockResolvedValue(OWNER);
    expect(await recordDirectoryEnquiry(BUSINESS_ENQUIRY, "203.0.113.9", NOW)).toBe("received");
    expect(resolveDirectoryNamed).toHaveBeenCalledWith(DB, { by: "key", key: KEY });
    expect(findListingOwner).toHaveBeenCalledWith(DB, SMILE);
    expect(recordEmail).toHaveBeenCalledTimes(1);
    const message = vi.mocked(recordEmail).mock.calls[0]?.[1];
    expect(message).toMatchObject({ toAddress: "meera@example.com", subject: "New enquiry for Smile Dental", template: "listing-enquiry" });
    expect(message?.bodyText).toContain("Anita Rao");
    expect(message?.bodyText).toContain("braces for kids");
    expect(message?.bodyText).toContain("https://app.example.com/leads");
  });

  it("sends a paying client and a member to the same Leads page", async () => {
    for (const account of ["client", "member"] as const) {
      vi.mocked(recordEmail).mockClear();
      vi.mocked(findListingOwner).mockResolvedValue({ ...OWNER, account });
      await recordDirectoryEnquiry(BUSINESS_ENQUIRY, "203.0.113.9", NOW);
      expect(vi.mocked(recordEmail).mock.calls[0]?.[1].bodyText).toContain("https://app.example.com/leads");
    }
  });

  it("emails nobody for a listing no one owns, an owner whose address is unconfirmed, or a shortlist request", async () => {
    await recordDirectoryEnquiry(BUSINESS_ENQUIRY, "203.0.113.9", NOW);
    vi.mocked(findListingOwner).mockResolvedValue({ ...OWNER, emailConfirmed: false });
    await recordDirectoryEnquiry(BUSINESS_ENQUIRY, "203.0.113.9", NOW);
    vi.mocked(findListingOwner).mockResolvedValue(OWNER);
    await recordDirectoryEnquiry(ENQUIRY, "203.0.113.9", NOW);
    expect(recordEmail).not.toHaveBeenCalled();
  });

  it("still takes the enquiry when the owner cannot be told", async () => {
    vi.mocked(findListingOwner).mockRejectedValue(new Error("database is down"));
    expect(await recordDirectoryEnquiry(BUSINESS_ENQUIRY, "203.0.113.9", NOW)).toBe("received");
  });
});

describe("recordDirectoryEnquiry", () => {
  it("rate-limits by address, phone and overall, then stores the enquiry", async () => {
    expect(await recordDirectoryEnquiry(ENQUIRY, "203.0.113.9", NOW)).toBe("received");
    expect(vi.mocked(consumeRateLimit).mock.calls.map((call) => call[1])).toEqual([
      "dir-enquiry:ip:203.0.113.9",
      `dir-enquiry:phone:${ENQUIRY.phone}`,
      "dir-enquiry:all",
    ]);
    expect(insertDirectoryEnquiry).toHaveBeenCalledWith(DB, ENQUIRY);
    expect(resolveDirectoryNamed).not.toHaveBeenCalled();
  });

  it("stores a business enquiry under the business's place, with the key it came by", async () => {
    expect(await recordDirectoryEnquiry(BUSINESS_ENQUIRY, "203.0.113.9", NOW)).toBe("received");
    expect(insertDirectoryEnquiry).toHaveBeenCalledWith(DB, { ...BUSINESS_ENQUIRY, business: SMILE });
  });

  it("refuses an enquiry to an id no place has, before spending any budget", async () => {
    vi.mocked(resolveDirectoryNamed).mockResolvedValue(null);
    expect(await recordDirectoryEnquiry({ ...BUSINESS_ENQUIRY, business: { by: "id", id: "zzzzzz2" } }, "203.0.113.9", NOW)).toBe("unknown_business");
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(insertDirectoryEnquiry).not.toHaveBeenCalled();
  });

  it("stores nothing once a budget is spent", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    expect(await recordDirectoryEnquiry(ENQUIRY, "203.0.113.9", NOW)).toBe("limited");
    expect(insertDirectoryEnquiry).not.toHaveBeenCalled();
  });

  it("keeps proof of the notice the visitor saw, against the enquiry it stored", async () => {
    vi.mocked(recordConsent).mockResolvedValue(undefined);
    expect(await recordDirectoryEnquiry({ ...ENQUIRY, noticeVersion: "pre-dpdp" }, "203.0.113.9", NOW)).toBe("received");
    expect(recordConsent).toHaveBeenCalledWith(DB, {
      subject: { type: "enquiry", ref: "enquiry-1" },
      purpose: "directory_enquiry",
      noticeVersion: "pre-dpdp",
      channel: "web",
    });
  });

  it("records no consent for an enquiry that carried no notice version, or that was not stored", async () => {
    await recordDirectoryEnquiry(ENQUIRY, "203.0.113.9", NOW);
    vi.mocked(consumeRateLimit).mockResolvedValueOnce({ allowed: false, remaining: 0, retryAfterSeconds: 60 });
    await recordDirectoryEnquiry({ ...ENQUIRY, noticeVersion: "pre-dpdp" }, "203.0.113.9", NOW);
    expect(recordConsent).not.toHaveBeenCalled();
  });

  it("still receives the enquiry when the consent record cannot be written, and logs it without the details", async () => {
    vi.mocked(recordConsent).mockRejectedValue(new Error(`write failed for ${ENQUIRY.phone}`));
    expect(await recordDirectoryEnquiry({ ...ENQUIRY, noticeVersion: "pre-dpdp" }, "203.0.113.9", NOW)).toBe("received");
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining("consent record"), expect.anything());
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(ENQUIRY.phone);
  });

  it("fails without logging the visitor's details", async () => {
    vi.mocked(insertDirectoryEnquiry).mockRejectedValue(new Error(`insert failed for ${ENQUIRY.phone}`));
    expect(await recordDirectoryEnquiry(ENQUIRY, "203.0.113.9", NOW)).toBe("failed");
    expect(JSON.stringify(vi.mocked(console.error).mock.calls)).not.toContain(ENQUIRY.phone);
  });
});
