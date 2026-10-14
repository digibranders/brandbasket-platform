import { describe, expect, it, vi } from "vitest";
import { handleContributionDeletion, handleOwnContributions, handlePrivacyRequestConfirm, handlePrivacyRequestOtp } from "./privacy-request-intake";

vi.mock("server-only", () => ({}));

const TOKEN = "t".repeat(40);
const NOW = new Date("2026-11-01T06:00:00.000Z");
const OTP_ID = "0198f2c0-0000-7000-8000-000000000001";
const WEBSITE = "https://fynix.digital";
const REVIEW_PAGE = "https://fynix.digital/in/mh/business/wow-momo/h3t9qcv2fv#review-0198f2c0-0000-7000-8000-0000000000bb";
const BODY = { kind: "erasure", name: "Meera", email: "Meera@Example.com", details: "", website: "", clientIp: "203.0.113.9" };

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`http://app.test${path}`, {
    method: "POST",
    headers: { authorization: `Bearer ${TOKEN}`, "content-type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

function otpDeps(outcome: Awaited<ReturnType<Parameters<typeof handlePrivacyRequestOtp>[1]["requestOtp"]>> = { kind: "otp_sent", otpId: OTP_ID, expiresInSeconds: 600, emailHint: "m•••@example.com" }) {
  const requestOtp = vi.fn(async () => outcome);
  return { deps: { token: TOKEN, websiteOrigin: WEBSITE, requestOtp, now: () => NOW }, requestOtp };
}

describe("POST /api/privacy-requests/otp", () => {
  it("refuses a wrong method, a missing token configuration, a wrong bearer token, a non-JSON body and a bad shape", async () => {
    const { deps, requestOtp } = otpDeps();
    expect((await handlePrivacyRequestOtp(new Request("http://app.test/x"), deps)).status).toBe(405);
    expect((await handlePrivacyRequestOtp(post("/x", BODY), { ...deps, token: null })).status).toBe(503);
    expect((await handlePrivacyRequestOtp(post("/x", BODY, { authorization: "Bearer nope" }), deps)).status).toBe(401);
    expect((await handlePrivacyRequestOtp(post("/x", BODY, { "content-type": "text/plain" }), deps)).status).toBe(415);
    expect((await handlePrivacyRequestOtp(post("/x", { ...BODY, kind: "breach" }), deps)).status).toBe(400);
    expect((await handlePrivacyRequestOtp(post("/x", { nonsense: true }), deps)).status).toBe(400);
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("no longer takes a visitor erasure: proving a phone number needs a text, and nothing is texted", async () => {
    const { deps, requestOtp } = otpDeps();
    const response = await handlePrivacyRequestOtp(post("/x", { ...BODY, kind: "visitor_erasure", name: "Meera Rao", details: "Delete my reviews." }), deps);
    expect(response.status).toBe(400);
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("asks for a code with the cleaned input, the visitor's address and the time", async () => {
    const { deps, requestOtp } = otpDeps();
    const response = await handlePrivacyRequestOtp(post("/x", { ...BODY, noticeVersion: "2026-10-13" }), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "otp_sent", otpId: OTP_ID, expiresInSeconds: 600, emailHint: "m•••@example.com" });
    expect(requestOtp).toHaveBeenCalledWith({ kind: "erasure", name: "Meera", email: "meera@example.com", details: null, noticeVersion: "2026-10-13" }, "203.0.113.9", NOW);
  });

  it("keeps the page a report is about above what the person wrote", async () => {
    const { deps, requestOtp } = otpDeps();
    const response = await handlePrivacyRequestOtp(post("/x", { ...BODY, kind: "content_report", details: "It names my child.", about: REVIEW_PAGE }), deps);
    expect(response.status).toBe(200);
    expect(requestOtp).toHaveBeenCalledWith(
      { kind: "content_report", name: "Meera", email: "meera@example.com", details: `About: ${REVIEW_PAGE}\n\nIt names my child.`, noticeVersion: null },
      "203.0.113.9",
      NOW,
    );
  });

  it("asks what is wrong with a reported post, and which listing when no page is named", async () => {
    const { deps, requestOtp } = otpDeps();
    const report = await handlePrivacyRequestOtp(post("/x", { ...BODY, kind: "content_report", about: REVIEW_PAGE }), deps);
    expect(report.status).toBe(422);
    expect(await report.json()).toMatchObject({ field: "details", message: "Tell us what is wrong with it." });
    const listing = await handlePrivacyRequestOtp(post("/x", { ...BODY, kind: "listing_removal" }), deps);
    expect(await listing.json()).toMatchObject({ field: "details", message: "Tell us which listing, and what is wrong with it." });
    expect(requestOtp).not.toHaveBeenCalled();

    const fromListing = await handlePrivacyRequestOtp(post("/x", { ...BODY, kind: "listing_removal", about: "https://fynix.digital/in/mh/business/wow-momo/h3t9qcv2fv" }), deps);
    expect(fromListing.status).toBe(200);
    expect(requestOtp).toHaveBeenCalledWith(expect.objectContaining({ details: "About: https://fynix.digital/in/mh/business/wow-momo/h3t9qcv2fv" }), "203.0.113.9", NOW);
  });

  it("takes a page on the website's www address, where fynix.digital sends every visitor", async () => {
    const { deps, requestOtp } = otpDeps();
    const www = "https://www.fynix.digital/in/mh/business/wow-momo/h3t9qcv2fv#review-0198f2c0-0000-7000-8000-0000000000bb";
    const response = await handlePrivacyRequestOtp(post("/x", { ...BODY, kind: "content_report", details: "Spam.", about: www }), deps);
    expect(response.status).toBe(200);
    expect(requestOtp).toHaveBeenCalledWith(expect.objectContaining({ details: `About: ${www}\n\nSpam.` }), "203.0.113.9", NOW);
  });

  it("refuses a page that is not on the website, so staff never open a link someone else chose", async () => {
    const { deps, requestOtp } = otpDeps();
    for (const about of ["https://evil.example/fynix.digital", "javascript:alert(1)", "not a url", "http://fynix.digital/in", "https://www.evil.example/x", "https://app.fynix.digital/x"]) {
      expect((await handlePrivacyRequestOtp(post("/x", { ...BODY, kind: "content_report", details: "Spam.", about }), deps)).status).toBe(400);
    }
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("answers a filled honeypot with a convincing success and does nothing", async () => {
    const { deps, requestOtp } = otpDeps();
    const response = await handlePrivacyRequestOtp(post("/x", { ...BODY, website: "http://spam.example" }), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "otp_sent", emailHint: "m•••@example.com" });
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("asks for a valid email address, naming the field, before any code is sent", async () => {
    const { deps, requestOtp } = otpDeps();
    for (const email of ["", "meera", "98765 43210"]) {
      const response = await handlePrivacyRequestOtp(post("/x", { ...BODY, email }), deps);
      expect(response.status).toBe(422);
      expect(await response.json()).toMatchObject({ status: "error", code: "invalid", field: "email" });
    }
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("answers a field problem with 422 and the field, before any code is sent", async () => {
    const { deps, requestOtp } = otpDeps();
    const response = await handlePrivacyRequestOtp(post("/x", { ...BODY, kind: "grievance" }), deps);
    expect(response.status).toBe(422);
    expect(await response.json()).toMatchObject({ status: "error", code: "invalid", field: "details" });
    expect(requestOtp).not.toHaveBeenCalled();
  });

  it("maps each outcome onto its status", async () => {
    const cases = [
      [{ kind: "limited" }, 429, "limited"],
      [{ kind: "unavailable" }, 503, "unavailable"],
      [{ kind: "failed" }, 500, "failed"],
    ] as const;
    for (const [outcome, status, code] of cases) {
      const response = await handlePrivacyRequestOtp(post("/x", BODY), otpDeps(outcome).deps);
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ status: "error", code });
    }
  });
});

describe("POST /api/privacy-requests/confirm", () => {
  const confirm = (outcome: Awaited<ReturnType<Parameters<typeof handlePrivacyRequestConfirm>[1]["confirmOtp"]>>) => {
    const confirmOtp = vi.fn(async () => outcome);
    return { deps: { token: TOKEN, confirmOtp, now: () => NOW }, confirmOtp };
  };
  const BODY_CONFIRM = { otpId: OTP_ID, code: "123456", clientIp: "203.0.113.9" };

  it("files the request and returns its reference and due date", async () => {
    const { deps, confirmOtp } = confirm({ kind: "received", reference: "PR-7K2M9QXD", dueAt: new Date("2026-12-01T06:00:00.000Z") });
    const response = await handlePrivacyRequestConfirm(post("/x", BODY_CONFIRM), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "received", reference: "PR-7K2M9QXD", dueAt: "2026-12-01T06:00:00.000Z" });
    expect(confirmOtp).toHaveBeenCalledWith(OTP_ID, "123456", "203.0.113.9", NOW);
  });

  it("refuses a code that is not six digits and an id that is not a UUID, without checking anything", async () => {
    const { deps, confirmOtp } = confirm({ kind: "failed" });
    expect((await handlePrivacyRequestConfirm(post("/x", { ...BODY_CONFIRM, code: "12345" }), deps)).status).toBe(400);
    expect((await handlePrivacyRequestConfirm(post("/x", { ...BODY_CONFIRM, otpId: "abc" }), deps)).status).toBe(400);
    expect((await handlePrivacyRequestConfirm(post("/x", BODY_CONFIRM, { authorization: "Bearer nope" }), deps)).status).toBe(401);
    expect(confirmOtp).not.toHaveBeenCalled();
  });

  it("maps each outcome onto its status", async () => {
    const cases = [
      [{ kind: "expired" }, 410, "expired"],
      [{ kind: "too_many_attempts", message: "Too many." }, 429, "too_many_attempts"],
      [{ kind: "wrong_code", message: "Not right." }, 422, "wrong_code"],
      [{ kind: "limited" }, 429, "limited"],
      [{ kind: "failed" }, 500, "failed"],
    ] as const;
    for (const [outcome, status, code] of cases) {
      const response = await handlePrivacyRequestConfirm(post("/x", BODY_CONFIRM), confirm(outcome).deps);
      expect(response.status).toBe(status);
      expect(await response.json()).toMatchObject({ status: "error", code });
    }
  });
});

describe("POST /api/privacy-requests/contribution", () => {
  const REVIEW_ID = "0198f2c0-0000-7000-8000-0000000000bb";
  const TARGET = { kind: "review", id: REVIEW_ID } as const;
  const DELETION = { target: TARGET, clientIp: "203.0.113.9", noticeVersion: "2026-10-13", visitorToken: "token" };
  const deletion = (outcome: Awaited<ReturnType<Parameters<typeof handleContributionDeletion>[1]["requestDeletion"]>>, visitorPhone: string | null = "+919876543210") => {
    const requestDeletion = vi.fn(async () => outcome);
    const resolveVisitorPhone = vi.fn(async () => visitorPhone);
    return { deps: { token: TOKEN, resolveVisitorPhone, requestDeletion, now: () => NOW }, requestDeletion, resolveVisitorPhone };
  };

  it("deletes at once for a recognised visitor, under the number the token proves", async () => {
    const { deps, requestDeletion, resolveVisitorPhone } = deletion({ kind: "deleted", reference: "PR-DELETED1" });
    const response = await handleContributionDeletion(post("/x", DELETION), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "deleted", reference: "PR-DELETED1" });
    expect(resolveVisitorPhone).toHaveBeenCalledWith("token", NOW);
    expect(requestDeletion).toHaveBeenCalledWith({ target: TARGET, phone: "+919876543210", noticeVersion: "2026-10-13" }, NOW);
  });

  it("answers a stale visitor token with signed_out, and deletes nothing", async () => {
    const { deps, requestDeletion } = deletion({ kind: "deleted", reference: "PR-DELETED1" }, null);
    const response = await handleContributionDeletion(post("/x", { ...DELETION, visitorToken: "stale" }), deps);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", code: "signed_out" });
    expect(requestDeletion).not.toHaveBeenCalled();
  });

  it("answers not found as it answers deleted, and a failure as a failure", async () => {
    const missing = await handleContributionDeletion(post("/x", DELETION), deletion({ kind: "not_found" }).deps);
    expect(missing.status).toBe(200);
    expect(await missing.json()).toEqual({ status: "not_found" });
    const failed = await handleContributionDeletion(post("/x", DELETION), deletion({ kind: "failed" }).deps);
    expect(failed.status).toBe(500);
    expect(await failed.json()).toMatchObject({ status: "error", code: "failed" });
  });

  it("no longer takes a typed number: with no visitor token there is no code to send, so the body is refused", async () => {
    const { deps, requestDeletion, resolveVisitorPhone } = deletion({ kind: "not_found" });
    const withoutToken = Object.fromEntries(Object.entries(DELETION).filter(([key]) => key !== "visitorToken"));
    for (const body of [withoutToken, { ...withoutToken, phone: { country: "IN", number: "98765 43210" } }]) {
      expect((await handleContributionDeletion(post("/x", body), deps)).status).toBe(400);
    }
    expect(requestDeletion).not.toHaveBeenCalled();
    expect(resolveVisitorPhone).not.toHaveBeenCalled();
  });

  it("takes everything on one business page as a target, by its place id only", async () => {
    const { deps, requestDeletion } = deletion({ kind: "deleted", reference: "PR-DELETED1" });
    const ok = await handleContributionDeletion(post("/x", { ...DELETION, target: { kind: "business", id: "k7m2q9a" } }), deps);
    expect(ok.status).toBe(200);
    expect(requestDeletion).toHaveBeenCalledWith(expect.objectContaining({ target: { kind: "business", id: "k7m2q9a" } }), NOW);
    expect((await handleContributionDeletion(post("/x", { ...DELETION, target: { kind: "business", id: REVIEW_ID } }), deps)).status).toBe(400);
  });

  it("refuses a wrong token, a bad target and a wrong method before doing anything", async () => {
    const { deps, requestDeletion } = deletion({ kind: "not_found" });
    expect((await handleContributionDeletion(post("/x", DELETION, { authorization: "Bearer nope" }), deps)).status).toBe(401);
    expect((await handleContributionDeletion(post("/x", { ...DELETION, target: { kind: "enquiry", id: REVIEW_ID } }), deps)).status).toBe(400);
    expect((await handleContributionDeletion(post("/x", { ...DELETION, target: { kind: "review", id: "abc" } }), deps)).status).toBe(400);
    expect((await handleContributionDeletion(new Request("http://app.test/x"), deps)).status).toBe(405);
    expect(requestDeletion).not.toHaveBeenCalled();
  });
});

describe("POST /api/privacy-requests/contribution/mine", () => {
  const REVIEW_A = "0198f2c0-0000-7000-8000-0000000000a1";
  const COMMENT_A = "0198f2c0-0000-7000-8000-0000000000c1";
  const BODY_MINE = { visitorToken: "token", reviewIds: [REVIEW_A], clientIp: "203.0.113.9" };
  const mine = (visitorPhone: string | null = "+919876543210") => {
    const listMine = vi.fn(async () => ({ kind: "ok" as const, reviews: [REVIEW_A], comments: [COMMENT_A] }));
    return { deps: { token: TOKEN, resolveVisitorPhone: vi.fn(async () => visitorPhone), listMine, now: () => NOW }, listMine };
  };

  it("answers with the visitor's own reviews and comments among those asked about", async () => {
    const { deps, listMine } = mine();
    const response = await handleOwnContributions(post("/x", BODY_MINE), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "ok", reviews: [REVIEW_A], comments: [COMMENT_A] });
    expect(listMine).toHaveBeenCalledWith("+919876543210", [REVIEW_A]);
  });

  it("answers a stale token with signed_out, and refuses too many ids or a bad one", async () => {
    const stale = mine(null);
    expect((await handleOwnContributions(post("/x", BODY_MINE), stale.deps)).status).toBe(401);
    expect(stale.listMine).not.toHaveBeenCalled();
    const { deps } = mine();
    expect((await handleOwnContributions(post("/x", { ...BODY_MINE, reviewIds: Array.from({ length: 51 }, () => REVIEW_A) }), deps)).status).toBe(400);
    expect((await handleOwnContributions(post("/x", { ...BODY_MINE, reviewIds: ["abc"] }), deps)).status).toBe(400);
    expect((await handleOwnContributions(post("/x", BODY_MINE, { authorization: "Bearer nope" }), deps)).status).toBe(401);
  });
});
