import { beforeEach, describe, expect, it, vi } from "vitest";
import type { AdsResponse, GalleryResponse, RatingsResponse, ReviewsResponse, SignalsResponse, StatusResponse } from "@/lib/directory-api";
import type { EnquiryInput, ReviewInput } from "./directory-fields";
import type { EnquiryOutcome } from "./directory-enquiries";
import type { ReviewConfirmOutcome, ReviewOtpOutcome } from "./directory-reviews";
import type { ResolvedVisitor } from "./directory-visitor";
import type { DirectoryEvent, DirectoryEventOutcome } from "./directory-signals";
import {
  enquiryResponse,
  handleAdsRequest,
  handleEnquiryRequest,
  handleEventRequest,
  handleGalleryRequest,
  handlePictureRequest,
  handleRatingsRequest,
  handleReviewConfirmRequest,
  handleReviewOtpRequest,
  handleReviewsRequest,
  handleSignalsRequest,
  handleStatusRequest,
  parseDirectoryAsk,
  parseReviewsPage,
  reviewConfirmResponse,
  reviewOtpResponse,
} from "./directory-intake";

vi.mock("server-only", () => ({}));

const TOKEN = "t".repeat(40);
const ORIGIN = "http://app.localhost:3001";
const NOW = new Date("2026-09-29T10:00:00.000Z");
const KEY = "dentists/thane/naupada/smile-dental";
/** A directory business's permanent id (docs/superpowers/plans/2026-10-01-directory-permanent-listing-id.md). */
const ID = "k7m2q9a";
/** Not ids: too short, no digit, upper case, a look-alike letter (o), eight characters. */
const NOT_IDS = ["k7m2q9", "abcdefg", "K7M2Q9A", "k7m2q9o", "k7m2q9ab"];
const OTP_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const REVIEW_BODY = {
  key: KEY,
  businessName: "Smile Dental",
  rating: 4,
  text: "  Gentle and quick.  ",
  highlights: ["on_time", "on_time", "clean"],
  name: "Priya Sharma",
  phone: { country: "IN", number: "98765 43210" },
  website: "",
  clientIp: "203.0.113.9",
  adult: true,
};

const ENQUIRY_BODY = {
  key: KEY,
  businessName: "Smile Dental",
  serviceLabel: "Dentists",
  areaLabel: "Naupada",
  kind: "business",
  name: "Ravi Kumar",
  phone: { country: "IN", number: "98111 11111" },
  message: "Do you do braces?",
  website: "",
  clientIp: "203.0.113.9",
};

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function get(pathAndQuery: string, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${pathAndQuery}`, { headers: { authorization: `Bearer ${TOKEN}`, ...headers } });
}

let otpCalls: { input: ReviewInput; clientIp: string; now: Date }[];
let otpOutcome: ReviewOtpOutcome;
let confirmCalls: { otpId: string; code: string; clientIp: string }[];
let confirmOutcome: ReviewConfirmOutcome;
let enquiryCalls: { enquiry: EnquiryInput; clientIp: string }[];
let enquiryOutcome: EnquiryOutcome;

/** The visitor the good token names; any other token is no good. */
const VISITOR_TOKEN = "good-visitor-token";
const VISITOR: ResolvedVisitor = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f0001",
  identity: { name: "Asha Verma", phone: "+919822222222" },
  session: { token: "renewed-token", name: "Asha Verma", phoneHint: "•••• 2222" },
};
const resolveVisitor = async (token: string): Promise<ResolvedVisitor | null> => (token === VISITOR_TOKEN ? VISITOR : null);
let visitorPublishCalls: { input: ReviewInput; clientIp: string }[];

const otpDeps = (token: string | null = TOKEN) => ({
  token,
  requestOtp: async (input: ReviewInput, clientIp: string, now: Date) => {
    otpCalls.push({ input, clientIp, now });
    return otpOutcome;
  },
  resolveVisitor,
  publishAsVisitor: async (input: ReviewInput, visitor: ResolvedVisitor, clientIp: string): Promise<ReviewOtpOutcome> => {
    visitorPublishCalls.push({ input, clientIp });
    return { kind: "published", visitor: visitor.session };
  },
  now: () => NOW,
});

const confirmDeps = (token: string | null = TOKEN) => ({
  token,
  confirmOtp: async (otpId: string, code: string, clientIp: string) => {
    confirmCalls.push({ otpId, code, clientIp });
    return confirmOutcome;
  },
  now: () => NOW,
});

const enquiryDeps = (token: string | null = TOKEN) => ({
  token,
  recordEnquiry: async (enquiry: EnquiryInput, clientIp: string) => {
    enquiryCalls.push({ enquiry, clientIp });
    return enquiryOutcome;
  },
  resolveVisitor,
  now: () => NOW,
});

beforeEach(() => {
  otpCalls = [];
  visitorPublishCalls = [];
  otpOutcome = { kind: "otp_sent", otpId: OTP_ID, expiresInSeconds: 600, phoneHint: "•••• 3210" };
  confirmCalls = [];
  confirmOutcome = { kind: "published" };
  enquiryCalls = [];
  enquiryOutcome = "received";
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("authorisation, shared by every directory route", () => {
  it.each([
    ["no header", {}],
    ["the wrong token", { authorization: `Bearer ${"x".repeat(40)}` }],
    ["a different scheme", { authorization: `Basic ${TOKEN}` }],
  ])("refuses a request with %s", async (_label, headers) => {
    const request = new Request(`${ORIGIN}/api/directory/reviews/otp`, {
      method: "POST",
      headers: { "content-type": "application/json", ...headers },
      body: JSON.stringify(REVIEW_BODY),
    });
    expect((await handleReviewOtpRequest(request, otpDeps())).status).toBe(401);
    const ratings = await handleRatingsRequest(new Request(`${ORIGIN}/api/directory/ratings?keys=${KEY}`, { headers }), {
      token: TOKEN,
      readRatings: async () => ({ ratings: {} }),
    });
    expect(ratings.status).toBe(401);
    const statuses = await handleStatusRequest(new Request(`${ORIGIN}/api/directory/status?keys=${KEY}`, { headers }), {
      token: TOKEN,
      readStatuses: async () => ({ statuses: {} }),
    });
    expect(statuses.status).toBe(401);
    expect(otpCalls).toHaveLength(0);
  });

  it("is unavailable, not open, when no token is configured", async () => {
    expect((await handleReviewOtpRequest(post("/api/directory/reviews/otp", REVIEW_BODY), otpDeps(null))).status).toBe(503);
    expect((await handleReviewConfirmRequest(post("/api/directory/reviews/confirm", {}), confirmDeps(null))).status).toBe(503);
    expect((await handleEnquiryRequest(post("/api/directory/enquiries", ENQUIRY_BODY), enquiryDeps(null))).status).toBe(503);
    expect((await handleStatusRequest(get(`/api/directory/status?keys=${KEY}`), { token: null, readStatuses: async () => ({ statuses: {} }) })).status).toBe(503);
    expect(otpCalls).toHaveLength(0);
    expect(enquiryCalls).toHaveLength(0);
  });

  it("answers the wrong method with 405", async () => {
    expect((await handleReviewOtpRequest(get("/api/directory/reviews/otp"), otpDeps())).status).toBe(405);
    const ratings = await handleRatingsRequest(post(`/api/directory/ratings?keys=${KEY}`, {}), {
      token: TOKEN,
      readRatings: async () => ({ ratings: {} }),
    });
    expect(ratings.status).toBe(405);
    const statuses = await handleStatusRequest(post(`/api/directory/status?keys=${KEY}`, {}), {
      token: TOKEN,
      readStatuses: async () => ({ statuses: {} }),
    });
    expect(statuses.status).toBe(405);
  });
});

describe("POST bodies", () => {
  it("only accepts JSON within the size limit, in the agreed shape", async () => {
    expect((await handleReviewOtpRequest(post("/api/directory/reviews/otp", REVIEW_BODY, { "content-type": "text/plain" }), otpDeps())).status).toBe(415);
    expect((await handleReviewOtpRequest(post("/api/directory/reviews/otp", "{nope"), otpDeps())).status).toBe(400);
    expect((await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, text: "x".repeat(17_000) }), otpDeps())).status).toBe(413);
    expect((await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, rating: 6 }), otpDeps())).status).toBe(400);
    expect((await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, key: "Dentists/thane" }), otpDeps())).status).toBe(400);
    expect((await handleReviewConfirmRequest(post("/api/directory/reviews/confirm", { otpId: OTP_ID, code: "12345", clientIp: "x" }), confirmDeps())).status).toBe(400);
    expect((await handleEnquiryRequest(post("/api/directory/enquiries", { ...ENQUIRY_BODY, kind: "other" }), enquiryDeps())).status).toBe(400);
    expect(otpCalls).toHaveLength(0);
    expect(confirmCalls).toHaveLength(0);
    expect(enquiryCalls).toHaveLength(0);
  });
});

describe("handleReviewOtpRequest", () => {
  it("hands a cleaned review to requestOtp with the visitor's address and the clock", async () => {
    const response = await handleReviewOtpRequest(post("/api/directory/reviews/otp", REVIEW_BODY), otpDeps());
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "otp_sent", otpId: OTP_ID, expiresInSeconds: 600, phoneHint: "•••• 3210" });
    expect(otpCalls).toEqual([
      {
        input: {
          business: { by: "key", key: KEY },
          businessName: "Smile Dental",
          rating: 4,
          text: "Gentle and quick.",
          highlights: ["on_time", "clean"],
          name: "Priya Sharma",
          phone: "+919876543210",
          ownerContact: false,
        },
        clientIp: "203.0.113.9",
        now: NOW,
      },
    ]);
  });

  it("carries the reviewer's tick letting the business contact them, and records it as a consent", async () => {
    const response = await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, noticeVersion: "2026-10-13.4", ownerContact: true }), otpDeps());
    expect(response.status).toBe(200);
    expect(otpCalls[0]?.input).toMatchObject({ ownerContact: true, consent: { noticeVersion: "2026-10-13.4", adult: true, ownerContact: true } });
  });

  it("carries what the reviewer agreed to: the notice version they saw and whether they ticked 18 or over", async () => {
    const response = await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, noticeVersion: "pre-dpdp", adult: true }), otpDeps());
    expect(response.status).toBe(200);
    expect(otpCalls[0]?.input.consent).toEqual({ noticeVersion: "pre-dpdp", adult: true });
  });

  it.each([["no tick", { adult: undefined }], ["a tick left off", { adult: false }]])("refuses a review with %s for 18 or over, whatever else it carries", async (_label, extra) => {
    const response = await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, noticeVersion: "2026-10-13", ...extra }), otpDeps());
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ status: "error", code: "invalid", message: "Confirm you’re 18 or over to post a review.", field: null });
    expect(otpCalls).toHaveLength(0);
  });

  it("records no consent for a request with no notice version", async () => {
    await handleReviewOtpRequest(post("/api/directory/reviews/otp", REVIEW_BODY), otpDeps());
    expect(otpCalls[0]?.input).not.toHaveProperty("consent");
  });

  it.each([["an empty notice version", { noticeVersion: "" }], ["one too long to be a label", { noticeVersion: "v".repeat(41) }]])("refuses %s", async (_label, extra) => {
    const response = await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, ...extra }), otpDeps());
    expect(response.status).toBe(400);
    expect(otpCalls).toHaveLength(0);
  });

  it("names the business by place id when the website sends one", async () => {
    // No key at all: JSON leaves an undefined property out.
    const response = await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, key: undefined, id: ID }), otpDeps());
    expect(response.status).toBe(200);
    expect(otpCalls[0]?.input.business).toEqual({ by: "id", id: ID });
  });

  it.each([
    ["a malformed id", { id: "k7m2q9" }],
    ["both a key and an id", { id: ID }],
    ["neither a key nor an id", { key: undefined }],
  ])("refuses a body with %s, and asks for no code", async (_label, overrides) => {
    const response = await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, ...overrides }), otpDeps());
    expect(response.status).toBe(400);
    expect(otpCalls).toHaveLength(0);
  });

  it("gives a filled honeypot a convincing success and does nothing", async () => {
    const response = await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, website: "spam.example" }), otpDeps());
    expect(response.status).toBe(200);
    const body = (await response.json()) as { otpId: string; phoneHint: string; status: string };
    expect(body.status).toBe("otp_sent");
    expect(body.otpId).toMatch(UUID_PATTERN);
    expect(body.phoneHint).toBe("•••• 3210");
    expect(otpCalls).toHaveLength(0);
  });

  it.each([
    [{ name: "   " }, "name"],
    [{ highlights: ["clean", "expert", "quality"] }, "highlights"],
    [{ highlights: ["sparkly"] }, "highlights"],
    [{ text: "x".repeat(501) }, "text"],
    [{ phone: { country: "IN", number: "12" } }, "phone"],
    [{ phone: { country: "", number: "98765 43210" } }, "phoneCountry"],
  ])("points the visitor at the field for %j", async (overrides, field) => {
    const response = await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, ...overrides }), otpDeps());
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "error", code: "invalid", field });
    expect(otpCalls).toHaveLength(0);
  });
});

describe("reviewOtpResponse", () => {
  it.each<[ReviewOtpOutcome, number, Record<string, unknown>]>([
    [{ kind: "invalid", field: "phone", message: "We can only text Indian mobile numbers right now." }, 422, { code: "invalid", field: "phone", message: "We can only text Indian mobile numbers right now." }],
    [{ kind: "limited" }, 429, { code: "limited", field: null }],
    [{ kind: "unavailable" }, 403, { code: "unavailable", field: null }],
    [{ kind: "failed" }, 500, { code: "failed", field: null }],
    [{ kind: "unknown_business" }, 422, { code: "invalid", field: null }],
  ])("maps %j to %i", async (outcome, status, body) => {
    const response = reviewOtpResponse(outcome);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ status: "error", ...body });
  });
});

describe("a recognised visitor (visitorToken)", () => {
  const asVisitor = { visitorToken: VISITOR_TOKEN, name: "", phone: { country: "", number: "" } };

  it("publishes a review at once under the account's name and number, with no code and no typed name or phone", async () => {
    const response = await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, ...asVisitor }), otpDeps());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "published", visitor: VISITOR.session });
    expect(otpCalls).toEqual([]);
    expect(visitorPublishCalls).toHaveLength(1);
    expect(visitorPublishCalls[0]?.input).toMatchObject({ name: "Asha Verma", phone: "+919822222222", rating: 4 });
  });

  it("ignores a name and number typed beside the token", async () => {
    await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, visitorToken: VISITOR_TOKEN }), otpDeps());
    expect(visitorPublishCalls[0]?.input).toMatchObject({ name: "Asha Verma", phone: "+919822222222" });
  });

  it("answers signed_out for a token that is no good, without sending a code or publishing", async () => {
    const response = await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, visitorToken: "forged" }), otpDeps());
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", code: "signed_out" });
    expect(otpCalls).toEqual([]);
    expect(visitorPublishCalls).toEqual([]);
  });

  it("still checks the rest of the review", async () => {
    const response = await handleReviewOtpRequest(post("/api/directory/reviews/otp", { ...REVIEW_BODY, ...asVisitor, businessName: "" }), otpDeps());
    expect(response.status).toBe(400);
    expect(visitorPublishCalls).toEqual([]);
  });

  it("sends an enquiry under the account and hands back a renewed token", async () => {
    const response = await handleEnquiryRequest(post("/api/directory/enquiries", { ...ENQUIRY_BODY, ...asVisitor }), enquiryDeps());
    expect(await response.json()).toEqual({ status: "received", visitor: VISITOR.session });
    expect(enquiryCalls[0]?.enquiry).toMatchObject({ name: "Asha Verma", phone: "+919822222222" });
  });

  it("refuses an enquiry with a token that is no good", async () => {
    const response = await handleEnquiryRequest(post("/api/directory/enquiries", { ...ENQUIRY_BODY, visitorToken: "forged" }), enquiryDeps());
    expect(response.status).toBe(401);
    expect(enquiryCalls).toEqual([]);
  });
});

describe("handleReviewConfirmRequest", () => {
  it("hands back the account the confirmed number now has", async () => {
    confirmOutcome = { kind: "published", visitor: VISITOR.session };
    const response = await handleReviewConfirmRequest(
      post("/api/directory/reviews/confirm", { otpId: OTP_ID, code: "004821", clientIp: "203.0.113.9" }),
      confirmDeps(),
    );
    expect(await response.json()).toEqual({ status: "published", visitor: VISITOR.session });
  });

  it("passes the code, id and address to confirmOtp and answers published", async () => {
    const response = await handleReviewConfirmRequest(
      post("/api/directory/reviews/confirm", { otpId: OTP_ID, code: "004821", clientIp: "203.0.113.9" }),
      confirmDeps(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "published" });
    expect(confirmCalls).toEqual([{ otpId: OTP_ID, code: "004821", clientIp: "203.0.113.9" }]);
  });

  it.each<[ReviewConfirmOutcome, number, Record<string, unknown>]>([
    [{ kind: "expired" }, 410, { code: "expired", field: null }],
    [{ kind: "too_many_attempts", message: "Too many attempts. Ask for a new code." }, 429, { code: "too_many_attempts", message: "Too many attempts. Ask for a new code." }],
    [{ kind: "wrong_code", message: "That code isn't right. 4 tries left." }, 422, { code: "wrong_code", field: "code", message: "That code isn't right. 4 tries left." }],
    [{ kind: "limited" }, 429, { code: "limited", field: null }],
    [{ kind: "failed" }, 500, { code: "failed", field: null }],
  ])("maps %j to %i", async (outcome, status, body) => {
    const response = reviewConfirmResponse(outcome);
    expect(response.status).toBe(status);
    expect(await response.json()).toMatchObject({ status: "error", ...body });
  });
});

describe("handleEnquiryRequest", () => {
  it("hands on the notice version the visitor saw, and leaves it out when the website sends none", async () => {
    await handleEnquiryRequest(post("/api/directory/enquiries", { ...ENQUIRY_BODY, noticeVersion: "pre-dpdp" }), enquiryDeps());
    await handleEnquiryRequest(post("/api/directory/enquiries", ENQUIRY_BODY), enquiryDeps());
    expect(enquiryCalls[0]?.enquiry.noticeVersion).toBe("pre-dpdp");
    expect(enquiryCalls[1]?.enquiry).not.toHaveProperty("noticeVersion");
  });

  it("refuses an empty or over-long notice version", async () => {
    expect((await handleEnquiryRequest(post("/api/directory/enquiries", { ...ENQUIRY_BODY, noticeVersion: "" }), enquiryDeps())).status).toBe(400);
    expect((await handleEnquiryRequest(post("/api/directory/enquiries", { ...ENQUIRY_BODY, noticeVersion: "v".repeat(41) }), enquiryDeps())).status).toBe(400);
  });

  it("stores a business enquiry with a parsed phone", async () => {
    const response = await handleEnquiryRequest(post("/api/directory/enquiries", ENQUIRY_BODY), enquiryDeps());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "received" });
    expect(enquiryCalls).toEqual([
      {
        enquiry: {
          kind: "business",
          business: { by: "key", key: KEY },
          businessName: "Smile Dental",
          serviceLabel: "Dentists",
          areaLabel: "Naupada",
          name: "Ravi Kumar",
          phone: "+919811111111",
          message: "Do you do braces?",
        },
        clientIp: "203.0.113.9",
      },
    ]);
  });

  it("stores a top-list request with no business and no message", async () => {
    const body = { ...ENQUIRY_BODY, kind: "top_list", key: null, businessName: null, areaLabel: "Thane", message: "" };
    expect((await handleEnquiryRequest(post("/api/directory/enquiries", body), enquiryDeps())).status).toBe(200);
    expect(enquiryCalls[0]?.enquiry).toMatchObject({ kind: "top_list", business: null, businessName: null, message: null });
  });

  it("refuses a business enquiry without its business, or a top-list one with one, as a page problem", async () => {
    for (const body of [
      { ...ENQUIRY_BODY, key: null },
      { ...ENQUIRY_BODY, kind: "top_list" },
      { ...ENQUIRY_BODY, kind: "top_list", key: null, businessName: null, id: ID },
      { ...ENQUIRY_BODY, id: ID },
    ]) {
      const response = await handleEnquiryRequest(post("/api/directory/enquiries", body), enquiryDeps());
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ code: "invalid", field: null });
    }
    expect(enquiryCalls).toHaveLength(0);
  });

  it("gives a filled honeypot the same answer and stores nothing", async () => {
    const response = await handleEnquiryRequest(post("/api/directory/enquiries", { ...ENQUIRY_BODY, website: "x" }), enquiryDeps());
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "received" });
    expect(enquiryCalls).toHaveLength(0);
  });

  it("points at the message when it is too long", async () => {
    const response = await handleEnquiryRequest(post("/api/directory/enquiries", { ...ENQUIRY_BODY, message: "x".repeat(501) }), enquiryDeps());
    expect(await response.json()).toMatchObject({ code: "invalid", field: "message" });
  });

  it("stores a business enquiry sent by place id", async () => {
    const response = await handleEnquiryRequest(post("/api/directory/enquiries", { ...ENQUIRY_BODY, key: null, id: ID }), enquiryDeps());
    expect(response.status).toBe(200);
    expect(enquiryCalls[0]?.enquiry).toMatchObject({ kind: "business", business: { by: "id", id: ID }, businessName: "Smile Dental" });
    const absentKey = { ...ENQUIRY_BODY, id: ID } as Record<string, unknown>;
    delete absentKey.key;
    expect((await handleEnquiryRequest(post("/api/directory/enquiries", absentKey), enquiryDeps())).status).toBe(200);
    expect((await handleEnquiryRequest(post("/api/directory/enquiries", { ...ENQUIRY_BODY, key: null, id: "k7m2q9" }), enquiryDeps())).status).toBe(400);
  });

  it("maps limited, failed and an unknown business", async () => {
    expect(enquiryResponse("limited").status).toBe(429);
    expect(enquiryResponse("failed").status).toBe(500);
    const unknown = enquiryResponse("unknown_business");
    expect(unknown.status).toBe(422);
    expect(await unknown.json()).toMatchObject({ status: "error", code: "invalid", field: null });
  });
});

describe("parseDirectoryAsk", () => {
  const ask = (query: string) => parseDirectoryAsk(new URL(`${ORIGIN}/api/directory/ratings?${query}`).searchParams);

  it("reads distinct, valid, comma-separated keys", () => {
    expect(ask(`keys=${KEY}, ${KEY},salons/thane/vasant-vihar/glow`)).toEqual({ ids: [], keys: [KEY, "salons/thane/vasant-vihar/glow"] });
  });

  it("reads distinct, valid, comma-separated ids, alongside keys", () => {
    expect(ask(`ids=${ID},b3cdefg,${ID}`)).toEqual({ ids: [ID, "b3cdefg"], keys: [] });
    expect(ask(`ids=${ID}&keys=${KEY}`)).toEqual({ ids: [ID], keys: [KEY] });
  });

  it.each(["", "keys=", "keys=,,", "keys=dentists/thane/naupada", `keys=${KEY},NOPE/a/b/c`, "ids=", "ids=,", ...NOT_IDS.map((id) => `ids=${ID},${id}`), `ids=${ID}&keys=nope`])(
    "refuses %j",
    (query) => {
      expect(ask(query)).toBeNull();
    },
  );

  it("refuses more than 50 businesses, ids and keys together", () => {
    const keys = Array.from({ length: 50 }, (_, index) => `dentists/thane/naupada/clinic-${index}`);
    expect(ask(`keys=${keys.join(",")}`)?.keys).toHaveLength(50);
    expect(ask(`keys=${keys.join(",")}&ids=${ID}`)).toBeNull();
    expect(ask(`keys=${keys.join(",")},dentists/thane/naupada/one-more`)).toBeNull();
  });
});

describe("handleRatingsRequest", () => {
  const ratings: RatingsResponse = {
    ratings: { [KEY]: { average: 4.3, count: 3, topHighlight: { id: "quality", label: "Great quality", count: 2 } } },
  };

  it("answers the summaries, cacheable for a minute", async () => {
    const read = vi.fn(async () => ratings);
    const response = await handleRatingsRequest(get(`/api/directory/ratings?keys=${KEY}`), { token: TOKEN, readRatings: read });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=60");
    expect(await response.json()).toEqual(ratings);
    expect(read).toHaveBeenCalledWith({ ids: [], keys: [KEY] });
  });

  it("asks by place id, and refuses anything that is not one with 400", async () => {
    const byId: RatingsResponse = { ratings: { [ID]: { average: 5, count: 1, topHighlight: null } } };
    const read = vi.fn(async () => byId);
    const response = await handleRatingsRequest(get(`/api/directory/ratings?ids=${ID}`), { token: TOKEN, readRatings: read });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(byId);
    expect(read).toHaveBeenCalledWith({ ids: [ID], keys: [] });
    for (const id of NOT_IDS) {
      expect((await handleRatingsRequest(get(`/api/directory/ratings?ids=${id}`), { token: TOKEN, readRatings: read })).status).toBe(400);
    }
    expect(read).toHaveBeenCalledTimes(1);
  });

  it("refuses a bad key list with 400 and a failed read with 500, neither cached", async () => {
    const bad = await handleRatingsRequest(get("/api/directory/ratings?keys=nope"), { token: TOKEN, readRatings: async () => ratings });
    expect(bad.status).toBe(400);
    const failed = await handleRatingsRequest(get(`/api/directory/ratings?keys=${KEY}`), {
      token: TOKEN,
      readRatings: async () => {
        throw new Error("down");
      },
    });
    expect(failed.status).toBe(500);
    expect(failed.headers.get("cache-control")).toBe("no-store");
  });
});

describe("handleStatusRequest", () => {
  const statuses: StatusResponse = {
    statuses: { [KEY]: { verifiedAt: "2026-09-29T09:00:00.000Z", phone: "+919820011223" } },
  };

  it("answers the verified statuses, cacheable for a minute", async () => {
    const read = vi.fn(async () => statuses);
    const response = await handleStatusRequest(get(`/api/directory/status?keys=${KEY},${KEY}`), { token: TOKEN, readStatuses: read });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=60");
    expect(await response.json()).toEqual(statuses);
    expect(read).toHaveBeenCalledWith({ ids: [], keys: [KEY] });
  });

  it("asks by place id", async () => {
    const read = vi.fn(async () => statuses);
    expect((await handleStatusRequest(get(`/api/directory/status?ids=${ID},${ID}`), { token: TOKEN, readStatuses: read })).status).toBe(200);
    expect(read).toHaveBeenCalledWith({ ids: [ID], keys: [] });
  });

  it("answers an empty record when nothing asked about is verified", async () => {
    const response = await handleStatusRequest(get(`/api/directory/status?keys=${KEY}`), {
      token: TOKEN,
      readStatuses: async () => ({ statuses: {} }),
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ statuses: {} });
  });

  it.each([
    ["no keys", "/api/directory/status"],
    ["an empty list", "/api/directory/status?keys="],
    ["a malformed key", "/api/directory/status?keys=nope"],
    ["a malformed id", "/api/directory/status?ids=k7m2q9"],
    ["51 keys", `/api/directory/status?keys=${Array.from({ length: 51 }, (_, index) => `gyms/thane/majiwada/gym-${index}`).join(",")}`],
  ])("refuses %s with 400 and reads nothing", async (_label, path) => {
    const read = vi.fn(async () => statuses);
    const response = await handleStatusRequest(get(path), { token: TOKEN, readStatuses: read });
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(read).not.toHaveBeenCalled();
  });

  it("answers a failed read with 500, not cached", async () => {
    const failed = await handleStatusRequest(get(`/api/directory/status?keys=${KEY}`), {
      token: TOKEN,
      readStatuses: async () => {
        throw new Error("down");
      },
    });
    expect(failed.status).toBe(500);
    expect(failed.headers.get("cache-control")).toBe("no-store");
  });
});

describe("handleGalleryRequest", () => {
  const galleries: GalleryResponse = {
    galleries: { [KEY]: { photos: ["0192f3c4-0000-7000-8000-000000000010"], videos: [] } },
  };

  it("answers the galleries of the businesses asked about, cacheable for a minute like the status answer", async () => {
    const read = vi.fn(async () => galleries);
    const response = await handleGalleryRequest(get(`/api/directory/gallery?keys=${KEY},${KEY}`), { token: TOKEN, readGalleries: read });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=60");
    expect(await response.json()).toEqual(galleries);
    expect(read).toHaveBeenCalledWith({ ids: [], keys: [KEY] });
  });

  it("asks by place id", async () => {
    const read = vi.fn(async () => galleries);
    expect((await handleGalleryRequest(get(`/api/directory/gallery?ids=${ID}`), { token: TOKEN, readGalleries: read })).status).toBe(200);
    expect(read).toHaveBeenCalledWith({ ids: [ID], keys: [] });
  });

  it("is for the website only: no token configured is 503 and a wrong one is 401, and nothing is read", async () => {
    const read = vi.fn(async () => galleries);
    expect((await handleGalleryRequest(get(`/api/directory/gallery?keys=${KEY}`), { token: null, readGalleries: read })).status).toBe(503);
    const wrong = new Request(`${ORIGIN}/api/directory/gallery?keys=${KEY}`, { headers: { authorization: "Bearer nope" } });
    expect((await handleGalleryRequest(wrong, { token: TOKEN, readGalleries: read })).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });

  it.each([
    ["no keys", "/api/directory/gallery"],
    ["an empty list", "/api/directory/gallery?keys="],
    ["a malformed key", "/api/directory/gallery?keys=nope"],
    ["a malformed id", "/api/directory/gallery?ids=k7m2q9"],
    ["51 keys", `/api/directory/gallery?keys=${Array.from({ length: 51 }, (_, index) => `gyms/thane/majiwada/gym-${index}`).join(",")}`],
  ])("refuses %s with 400 and reads nothing", async (_label, path) => {
    const read = vi.fn(async () => galleries);
    const response = await handleGalleryRequest(get(path), { token: TOKEN, readGalleries: read });
    expect(response.status).toBe(400);
    expect(read).not.toHaveBeenCalled();
  });

  it("answers a failed read with 500, not cached", async () => {
    const failed = await handleGalleryRequest(get(`/api/directory/gallery?keys=${KEY}`), {
      token: TOKEN,
      readGalleries: async () => {
        throw new Error("down");
      },
    });
    expect(failed.status).toBe(500);
    expect(failed.headers.get("cache-control")).toBe("no-store");
  });
});

describe("parseReviewsPage and handleReviewsRequest", () => {
  it.each([
    [null, 1],
    ["1", 1],
    ["12", 12],
    ["0", null],
    ["-1", null],
    ["1.5", null],
    ["01", null],
    ["10001", null],
  ])("reads page %j as %j", (raw, page) => {
    expect(parseReviewsPage(raw)).toBe(page);
  });

  it("reads one listing's page", async () => {
    const page: ReviewsResponse = { summary: null, reviews: [], page: 2, pageCount: 1 };
    const read = vi.fn(async () => page);
    const response = await handleReviewsRequest(get(`/api/directory/reviews?key=${encodeURIComponent(KEY)}&page=2`), {
      token: TOKEN,
      readReviews: read,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual(page);
    expect(read).toHaveBeenCalledWith({ by: "key", key: KEY }, 2);
  });

  it("reads one business's page by its place id", async () => {
    const read = vi.fn(async (): Promise<ReviewsResponse> => ({ summary: null, reviews: [], page: 1, pageCount: 1 }));
    expect((await handleReviewsRequest(get(`/api/directory/reviews?id=${ID}`), { token: TOKEN, readReviews: read })).status).toBe(200);
    expect(read).toHaveBeenCalledWith({ by: "id", id: ID }, 1);
  });

  it("refuses a missing key, a bad id, both at once, or a bad page", async () => {
    const read = vi.fn(async (): Promise<ReviewsResponse> => ({ summary: null, reviews: [], page: 1, pageCount: 1 }));
    const deps = { token: TOKEN, readReviews: read };
    expect((await handleReviewsRequest(get("/api/directory/reviews"), deps)).status).toBe(400);
    expect((await handleReviewsRequest(get("/api/directory/reviews?id=k7m2q9"), deps)).status).toBe(400);
    expect((await handleReviewsRequest(get(`/api/directory/reviews?id=${ID}&key=${KEY}`), deps)).status).toBe(400);
    expect((await handleReviewsRequest(get(`/api/directory/reviews?key=${KEY}&page=0`), deps)).status).toBe(400);
    expect(read).not.toHaveBeenCalled();
  });
});

describe("handleSignalsRequest", () => {
  const signals: SignalsResponse = { signals: { [KEY]: { trending: true } } };

  it("answers the trending keys for now, cacheable for a minute", async () => {
    const read = vi.fn(async () => signals);
    const response = await handleSignalsRequest(get(`/api/directory/signals?keys=${KEY},${KEY}`), { token: TOKEN, readSignals: read, now: () => NOW });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=60");
    expect(await response.json()).toEqual(signals);
    expect(read).toHaveBeenCalledWith({ ids: [], keys: [KEY] }, NOW);
  });

  it("asks by place id", async () => {
    const read = vi.fn(async () => signals);
    expect((await handleSignalsRequest(get(`/api/directory/signals?ids=${ID}`), { token: TOKEN, readSignals: read, now: () => NOW })).status).toBe(200);
    expect(read).toHaveBeenCalledWith({ ids: [ID], keys: [] }, NOW);
  });

  it("answers an empty record when nothing asked about is trending", async () => {
    const response = await handleSignalsRequest(get(`/api/directory/signals?keys=${KEY}`), {
      token: TOKEN,
      readSignals: async () => ({ signals: {} }),
      now: () => NOW,
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ signals: {} });
  });

  it.each([
    ["no keys", "/api/directory/signals"],
    ["an empty list", "/api/directory/signals?keys="],
    ["a malformed key", "/api/directory/signals?keys=nope"],
    ["a malformed id", "/api/directory/signals?ids=abcdefg"],
    ["51 keys", `/api/directory/signals?keys=${Array.from({ length: 51 }, (_, index) => `gyms/thane/majiwada/gym-${index}`).join(",")}`],
  ])("refuses %s with 400 and reads nothing", async (_label, path) => {
    const read = vi.fn(async () => signals);
    const response = await handleSignalsRequest(get(path), { token: TOKEN, readSignals: read, now: () => NOW });
    expect(response.status).toBe(400);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(read).not.toHaveBeenCalled();
  });

  it("checks the method and the token", async () => {
    const read = vi.fn(async () => signals);
    const path = `/api/directory/signals?keys=${KEY}`;
    expect((await handleSignalsRequest(post(path, {}), { token: TOKEN, readSignals: read, now: () => NOW })).status).toBe(405);
    expect((await handleSignalsRequest(get(path), { token: null, readSignals: read, now: () => NOW })).status).toBe(503);
    const wrongToken = get(path, { authorization: `Bearer ${"x".repeat(40)}` });
    expect((await handleSignalsRequest(wrongToken, { token: TOKEN, readSignals: read, now: () => NOW })).status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });

  it("answers a failed read with 500, not cached", async () => {
    const failed = await handleSignalsRequest(get(`/api/directory/signals?keys=${KEY}`), {
      token: TOKEN,
      readSignals: async () => {
        throw new Error("down");
      },
      now: () => NOW,
    });
    expect(failed.status).toBe(500);
    expect(failed.headers.get("cache-control")).toBe("no-store");
  });
});

describe("handleEventRequest", () => {
  const EVENT_BODY = { key: KEY, kind: "whatsapp", clientIp: "203.0.113.9" };
  let eventCalls: { event: DirectoryEvent; now: Date }[];
  let eventOutcome: DirectoryEventOutcome;
  const eventDeps = (token: string | null = TOKEN) => ({
    token,
    recordEvent: async (event: DirectoryEvent, now: Date) => {
      eventCalls.push({ event, now });
      return eventOutcome;
    },
    now: () => NOW,
  });

  beforeEach(() => {
    eventCalls = [];
    eventOutcome = "counted";
  });

  it("records the event and answers 202 counted, not cached", async () => {
    const response = await handleEventRequest(post("/api/directory/events", EVENT_BODY), eventDeps());
    expect(response.status).toBe(202);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "counted" });
    expect(eventCalls).toEqual([{ event: { business: { by: "key", key: KEY }, kind: "whatsapp", clientIp: "203.0.113.9" }, now: NOW }]);
  });

  it("records an event on a business named by its place id", async () => {
    const response = await handleEventRequest(post("/api/directory/events", { id: ID, kind: "view", clientIp: "203.0.113.9" }), eventDeps());
    expect(response.status).toBe(202);
    expect(eventCalls).toEqual([{ event: { business: { by: "id", id: ID }, kind: "view", clientIp: "203.0.113.9" }, now: NOW }]);
  });

  it("records a share of a business's profile", async () => {
    const response = await handleEventRequest(post("/api/directory/events", { id: ID, kind: "share", clientIp: "203.0.113.9" }), eventDeps());
    expect(response.status).toBe(202);
    expect(eventCalls).toEqual([{ event: { business: { by: "id", id: ID }, kind: "share", clientIp: "203.0.113.9" }, now: NOW }]);
  });

  it.each(["repeat", "limited", "failed", "unknown_business"] as const)("answers a %s event exactly like a counted one", async (outcome) => {
    eventOutcome = outcome;
    const response = await handleEventRequest(post("/api/directory/events", EVENT_BODY), eventDeps());
    expect(response.status).toBe(202);
    expect(await response.json()).toEqual({ status: "counted" });
  });

  it("checks the method and the token", async () => {
    expect((await handleEventRequest(get("/api/directory/events"), eventDeps())).status).toBe(405);
    expect((await handleEventRequest(post("/api/directory/events", EVENT_BODY), eventDeps(null))).status).toBe(503);
    const wrongToken = post("/api/directory/events", EVENT_BODY, { authorization: `Bearer ${"x".repeat(40)}` });
    expect((await handleEventRequest(wrongToken, eventDeps())).status).toBe(401);
    expect(eventCalls).toHaveLength(0);
  });

  it.each([
    ["not JSON", post("/api/directory/events", EVENT_BODY, { "content-type": "text/plain" }), 415],
    ["broken JSON", post("/api/directory/events", "{nope"), 400],
    ["too large", post("/api/directory/events", { ...EVENT_BODY, padding: "x".repeat(3_000) }), 413],
    ["an unknown kind", post("/api/directory/events", { ...EVENT_BODY, kind: "sneeze" }), 400],
    ["a malformed key", post("/api/directory/events", { ...EVENT_BODY, key: "Restaurants/ambarnath" }), 400],
    ["a malformed id", post("/api/directory/events", { id: "k7m2q9", kind: "view", clientIp: "203.0.113.9" }), 400],
    ["both a key and an id", post("/api/directory/events", { ...EVENT_BODY, id: ID }), 400],
    ["neither a key nor an id", post("/api/directory/events", { kind: "view", clientIp: "203.0.113.9" }), 400],
    ["no address", post("/api/directory/events", { ...EVENT_BODY, clientIp: "" }), 400],
    ["an overlong address", post("/api/directory/events", { ...EVENT_BODY, clientIp: "1".repeat(65) }), 400],
  ])("refuses a body that is %s and records nothing", async (_label, request, status) => {
    expect((await handleEventRequest(request, eventDeps())).status).toBe(status);
    expect(eventCalls).toHaveLength(0);
  });
});

describe("handleAdsRequest", () => {
  const ads: AdsResponse = { top: { key: KEY, id: ID, name: "Smile Dental", tagline: null }, side: [] };

  it("answers the market's ads for now, cacheable for a minute", async () => {
    const read = vi.fn(async () => ads);
    const response = await handleAdsRequest(get("/api/directory/ads?market=dentists/thane/naupada"), { token: TOKEN, readAds: read, now: () => NOW });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("public, s-maxage=60");
    expect(await response.json()).toEqual(ads);
    expect(read).toHaveBeenCalledWith("dentists/thane/naupada", NOW);
  });

  it.each([
    ["no market", "/api/directory/ads"],
    ["a listing key", `/api/directory/ads?market=${KEY}`],
    ["a malformed market", "/api/directory/ads?market=Dentists/Thane"],
  ])("refuses %s with 400 and reads nothing", async (_label, path) => {
    const read = vi.fn(async () => ads);
    const response = await handleAdsRequest(get(path), { token: TOKEN, readAds: read, now: () => NOW });
    expect(response.status).toBe(400);
    expect(read).not.toHaveBeenCalled();
  });

  it("refuses a caller without the token", async () => {
    const read = vi.fn(async () => ads);
    const response = await handleAdsRequest(new Request(`${ORIGIN}/api/directory/ads?market=dentists/thane/naupada`), { token: TOKEN, readAds: read, now: () => NOW });
    expect(response.status).toBe(401);
    expect(read).not.toHaveBeenCalled();
  });

  it("answers 500 without details when reading fails", async () => {
    const response = await handleAdsRequest(get("/api/directory/ads?market=dentists/thane/naupada"), {
      token: TOKEN,
      readAds: async () => {
        throw new Error("db down");
      },
      now: () => NOW,
    });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("db down");
  });
});

describe("handlePictureRequest", () => {
  const PICTURE_ID = "0192f3c4-0000-7000-8000-000000000001";
  const path = `/api/directory/pictures/${PICTURE_ID}`;

  it("passes the picture on, with the caller's validator", async () => {
    const serve = vi.fn(async () => new Response(new Uint8Array([1, 2, 3]), { status: 200, headers: { "Content-Type": "image/webp" } }));
    const request = new Request(`${ORIGIN}${path}`, { headers: { authorization: `Bearer ${TOKEN}`, "if-none-match": '"abc"' } });
    const response = await handlePictureRequest(request, PICTURE_ID, { token: TOKEN, servePicture: serve });
    expect(response.status).toBe(200);
    expect(response.headers.get("content-type")).toBe("image/webp");
    expect(new Uint8Array(await response.arrayBuffer())).toEqual(new Uint8Array([1, 2, 3]));
    expect(serve).toHaveBeenCalledWith(PICTURE_ID, '"abc"', null);
  });

  it("asks for the width in ?w=, only for the widths a picture is copied to", async () => {
    const serve = vi.fn(async () => new Response(null, { status: 200 }));
    const withWidth = (query: string): Request => new Request(`${ORIGIN}${path}${query}`, { headers: { authorization: `Bearer ${TOKEN}` } });
    await handlePictureRequest(withWidth("?w=320"), PICTURE_ID, { token: TOKEN, servePicture: serve });
    await handlePictureRequest(withWidth("?w=640"), PICTURE_ID, { token: TOKEN, servePicture: serve });
    expect(serve).toHaveBeenNthCalledWith(1, PICTURE_ID, null, 320);
    expect(serve).toHaveBeenNthCalledWith(2, PICTURE_ID, null, 640);

    // Any other width, or something that is not a number, is ignored: the picture itself is served.
    for (const query of ["?w=321", "?w=0", "?w=-320", "?w=abc", "?w=", "?w=320.5", "?w=320&w=640", "?w=1e3"]) {
      serve.mockClear();
      await handlePictureRequest(withWidth(query), PICTURE_ID, { token: TOKEN, servePicture: serve });
      expect(serve, query).toHaveBeenCalledWith(PICTURE_ID, null, null);
    }
  });

  it("refuses a caller without the token and serves nothing", async () => {
    const serve = vi.fn(async () => new Response(null, { status: 200 }));
    const response = await handlePictureRequest(new Request(`${ORIGIN}${path}`), PICTURE_ID, { token: TOKEN, servePicture: serve });
    expect(response.status).toBe(401);
    expect(serve).not.toHaveBeenCalled();
  });

  it("answers 500 without details when reading fails", async () => {
    const response = await handlePictureRequest(get(path), PICTURE_ID, {
      token: TOKEN,
      servePicture: async () => {
        throw new Error("disk gone");
      },
    });
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain("disk gone");
  });
});
