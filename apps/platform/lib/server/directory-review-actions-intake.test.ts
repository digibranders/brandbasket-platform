import { describe, expect, it, vi } from "vitest";
import type { CommentInput } from "./directory-fields";
import { handleCommentOtpRequest, handleReviewHelpfulRequest, handleReviewConfirmRequest } from "./directory-intake";
import type { CommentOtpOutcome, ReviewHelpfulOutcome } from "./directory-review-actions";
import type { ReviewConfirmOutcome } from "./directory-reviews";
import type { ResolvedVisitor } from "./directory-visitor";

vi.mock("server-only", () => ({}));

const TOKEN = "t".repeat(40);
const ORIGIN = "http://app.localhost:3001";
const NOW = new Date("2026-10-08T10:00:00.000Z");
const REVIEW_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5c";
const OTP_ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";

const COMMENT_BODY = {
  reviewId: REVIEW_ID,
  text: "  Same experience here.  ",
  name: "  Rahul Mehta ",
  phone: { country: "IN", number: "98765 43210" },
  website: "",
  clientIp: "203.0.113.9",
  adult: true,
};

function post(path: string, body: unknown, headers: Record<string, string> = {}): Request {
  return new Request(`${ORIGIN}${path}`, {
    method: "POST",
    headers: { "content-type": "application/json", authorization: `Bearer ${TOKEN}`, ...headers },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

function helpfulDeps(outcome: ReviewHelpfulOutcome, token: string | null = TOKEN) {
  const calls: { reviewId: string; clientIp: string; now: Date }[] = [];
  return {
    calls,
    deps: {
      token,
      markHelpful: (reviewId: string, clientIp: string, now: Date) => {
        calls.push({ reviewId, clientIp, now });
        return Promise.resolve(outcome);
      },
      now: () => NOW,
    },
  };
}

const VISITOR_TOKEN = "good-visitor-token";
const VISITOR: ResolvedVisitor = {
  id: "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f0001",
  identity: { name: "Asha Verma", phone: "+919822222222" },
  session: { token: "renewed-token", name: "Asha Verma", phoneHint: "•••• 2222" },
};

function commentDeps(outcome: CommentOtpOutcome, token: string | null = TOKEN) {
  const calls: { input: CommentInput; clientIp: string }[] = [];
  return {
    calls,
    deps: {
      token,
      requestOtp: (input: CommentInput, clientIp: string) => {
        calls.push({ input, clientIp });
        return Promise.resolve(outcome);
      },
      resolveVisitor: (token: string) => Promise.resolve(token === VISITOR_TOKEN ? VISITOR : null),
      publishAsVisitor: (input: CommentInput, visitor: ResolvedVisitor, clientIp: string): Promise<CommentOtpOutcome> => {
        calls.push({ input, clientIp });
        return Promise.resolve({ kind: "published", visitor: visitor.session });
      },
      now: () => NOW,
    },
  };
}

const SENT: CommentOtpOutcome = { kind: "otp_sent", otpId: OTP_ID, expiresInSeconds: 600, phoneHint: "+91 ••••• ••210" };

describe("handleReviewHelpfulRequest", () => {
  const PATH = "/api/directory/reviews/helpful";

  it("counts a helpful mark and answers with the count, uncached", async () => {
    const { deps, calls } = helpfulDeps({ kind: "counted", helpful: 7 });
    const response = await handleReviewHelpfulRequest(post(PATH, { reviewId: REVIEW_ID, clientIp: "203.0.113.9" }), deps);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(await response.json()).toEqual({ status: "counted", helpful: 7 });
    expect(calls).toEqual([{ reviewId: REVIEW_ID, clientIp: "203.0.113.9", now: NOW }]);
  });

  it("answers 405 to a GET, 503 with no token configured and 401 to a wrong token", async () => {
    const { deps } = helpfulDeps({ kind: "counted", helpful: 1 });
    expect((await handleReviewHelpfulRequest(new Request(`${ORIGIN}${PATH}`, { headers: { authorization: `Bearer ${TOKEN}` } }), deps)).status).toBe(405);
    expect((await handleReviewHelpfulRequest(post(PATH, {}), helpfulDeps({ kind: "counted", helpful: 1 }, null).deps)).status).toBe(503);
    expect((await handleReviewHelpfulRequest(post(PATH, {}, { authorization: "Bearer nope" }), deps)).status).toBe(401);
  });

  it("answers 415 to a body that is not JSON, 413 to an oversized one and 400 to a malformed one", async () => {
    const { deps, calls } = helpfulDeps({ kind: "counted", helpful: 1 });
    expect((await handleReviewHelpfulRequest(post(PATH, {}, { "content-type": "text/plain" }), deps)).status).toBe(415);
    expect((await handleReviewHelpfulRequest(post(PATH, { reviewId: REVIEW_ID, clientIp: "x".repeat(5000) }), deps)).status).toBe(413);
    expect((await handleReviewHelpfulRequest(post(PATH, "{nope"), deps)).status).toBe(400);
    expect((await handleReviewHelpfulRequest(post(PATH, { reviewId: "not-a-uuid", clientIp: "203.0.113.9" }), deps)).status).toBe(400);
    expect((await handleReviewHelpfulRequest(post(PATH, { reviewId: REVIEW_ID }), deps)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it("maps a review that is gone to 422, an address over its ceiling to 429 and a failure to 500", async () => {
    const body = { reviewId: REVIEW_ID, clientIp: "203.0.113.9" };
    const gone = await handleReviewHelpfulRequest(post(PATH, body), helpfulDeps({ kind: "unknown_review" }).deps);
    expect(gone.status).toBe(422);
    expect(await gone.json()).toMatchObject({ status: "error", code: "invalid", field: null });
    expect((await handleReviewHelpfulRequest(post(PATH, body), helpfulDeps({ kind: "limited" }).deps)).status).toBe(429);
    expect((await handleReviewHelpfulRequest(post(PATH, body), helpfulDeps({ kind: "failed" }).deps)).status).toBe(500);
  });
});

describe("handleCommentOtpRequest", () => {
  const PATH = "/api/directory/reviews/comments/otp";

  it("publishes a recognised visitor's comment at once under their account, with no code", async () => {
    const { deps, calls } = commentDeps(SENT);
    const response = await handleCommentOtpRequest(
      post(PATH, { ...COMMENT_BODY, visitorToken: VISITOR_TOKEN, name: "", phone: { country: "", number: "" } }),
      deps,
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "published", visitor: VISITOR.session });
    expect(calls).toEqual([
      { input: { reviewId: REVIEW_ID, name: "Asha Verma", text: "Same experience here.", phone: "+919822222222" }, clientIp: "203.0.113.9" },
    ]);
  });

  it("answers signed_out for a token that is no good and does nothing", async () => {
    const { deps, calls } = commentDeps(SENT);
    const response = await handleCommentOtpRequest(post(PATH, { ...COMMENT_BODY, visitorToken: "forged" }), deps);
    expect(response.status).toBe(401);
    expect(await response.json()).toMatchObject({ status: "error", code: "signed_out" });
    expect(calls).toEqual([]);
  });

  it("passes the cleaned comment on and answers with the code's id and where it went", async () => {
    const { deps, calls } = commentDeps(SENT);
    const response = await handleCommentOtpRequest(post(PATH, COMMENT_BODY), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ status: "otp_sent", otpId: OTP_ID, expiresInSeconds: 600, phoneHint: "+91 ••••• ••210" });
    expect(calls).toEqual([
      { input: { reviewId: REVIEW_ID, name: "Rahul Mehta", text: "Same experience here.", phone: "+919876543210" }, clientIp: "203.0.113.9" },
    ]);
  });

  it("answers a filled honeypot like a person and does nothing", async () => {
    const { deps, calls } = commentDeps(SENT);
    const response = await handleCommentOtpRequest(post(PATH, { ...COMMENT_BODY, website: "https://spam.example" }), deps);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ status: "otp_sent", phoneHint: "•••• 3210" });
    expect(calls).toEqual([]);
  });

  it("points a visitor at the field to fix: an empty or too long comment, no name, a bad number", async () => {
    const { deps, calls } = commentDeps(SENT);
    const refusal = async (body: object) => {
      const response = await handleCommentOtpRequest(post(PATH, { ...COMMENT_BODY, ...body }), deps);
      return { status: response.status, body: await response.json() };
    };
    expect(await refusal({ text: "   " })).toMatchObject({ status: 422, body: { code: "invalid", field: "text", message: "Write your comment." } });
    expect(await refusal({ text: "a".repeat(301) })).toMatchObject({ status: 422, body: { field: "text" } });
    expect(await refusal({ name: "  " })).toMatchObject({ status: 422, body: { field: "name" } });
    expect(await refusal({ phone: { country: "IN", number: "" } })).toMatchObject({ status: 422, body: { field: "phone" } });
    expect(calls).toEqual([]);
  });

  it("accepts a comment of exactly the limit", async () => {
    const { deps, calls } = commentDeps(SENT);
    expect((await handleCommentOtpRequest(post(PATH, { ...COMMENT_BODY, text: "a".repeat(300) }), deps)).status).toBe(200);
    expect(calls).toHaveLength(1);
  });

  it("refuses a comment without the 18 or over tick, and sends no code", async () => {
    const { deps, calls } = commentDeps(SENT);
    const response = await handleCommentOtpRequest(post(PATH, { ...COMMENT_BODY, adult: false }), deps);
    expect(response.status).toBe(422);
    expect(await response.json()).toEqual({ status: "error", code: "invalid", message: "Confirm you’re 18 or over to post a comment.", field: null });
    expect(calls).toHaveLength(0);
  });

  it("maps each outcome of the work onto its status", async () => {
    const status = async (outcome: CommentOtpOutcome) => (await handleCommentOtpRequest(post(PATH, COMMENT_BODY), commentDeps(outcome).deps)).status;
    expect(await status({ kind: "unknown_review" })).toBe(422);
    expect(await status({ kind: "invalid", field: "phone", message: "Not that country." })).toBe(422);
    expect(await status({ kind: "limited" })).toBe(429);
    expect(await status({ kind: "unavailable" })).toBe(403);
    expect(await status({ kind: "failed" })).toBe(500);
  });

  it("tells a visitor the review is gone in words, with no field to point at", async () => {
    const response = await handleCommentOtpRequest(post(PATH, COMMENT_BODY), commentDeps({ kind: "unknown_review" }).deps);
    expect(await response.json()).toEqual({
      status: "error",
      code: "invalid",
      message: "We couldn't find this review. Refresh the page and try again.",
      field: null,
    });
  });

  it("answers 401 to a wrong token and 400 to a body that is not a comment request", async () => {
    const { deps } = commentDeps(SENT);
    expect((await handleCommentOtpRequest(post(PATH, COMMENT_BODY, { authorization: "Bearer nope" }), deps)).status).toBe(401);
    expect((await handleCommentOtpRequest(post(PATH, { ...COMMENT_BODY, reviewId: "nope" }), deps)).status).toBe(400);
  });
});

describe("comment confirmation", () => {
  it("answers exactly like a review's, through the same handler", async () => {
    const outcomes: [ReviewConfirmOutcome, number][] = [
      [{ kind: "published" }, 200],
      [{ kind: "expired" }, 410],
      [{ kind: "wrong_code", message: "That code isn't right. 4 tries left." }, 422],
      [{ kind: "limited" }, 429],
    ];
    for (const [outcome, status] of outcomes) {
      const response = await handleReviewConfirmRequest(post("/api/directory/reviews/comments/confirm", { otpId: OTP_ID, code: "123456", clientIp: "203.0.113.9" }), {
        token: TOKEN,
        confirmOtp: () => Promise.resolve(outcome),
        now: () => NOW,
      });
      expect(response.status).toBe(status);
    }
  });
});
