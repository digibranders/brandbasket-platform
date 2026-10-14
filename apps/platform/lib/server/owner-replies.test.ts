import { beforeEach, describe, expect, it, vi } from "vitest";
import type { DirectoryRef } from "@firstfold/db";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: () => DB }));
vi.mock("./website-refresh", () => ({ scheduleWebsiteRefresh: vi.fn() }));
vi.mock("@firstfold/db", () => ({
  consumeRateLimit: vi.fn(),
  editOwnerReply: vi.fn(),
  postOwnerReply: vi.fn(),
  removeOwnerReply: vi.fn(),
}));

import { consumeRateLimit, editOwnerReply, postOwnerReply, removeOwnerReply } from "@firstfold/db";
import type { OwnedBusiness } from "./owner-business";
import { changeReply, postReply, takeDownReply } from "./owner-replies";
import { scheduleWebsiteRefresh } from "./website-refresh";

const DB = { name: "staff-db" };
const NOW = new Date("2026-10-12T10:00:00.000Z");
const REVIEW = "0197d9a0-0000-7000-8000-000000000001";
const COMMENT = "0197d9a0-0000-7000-8000-000000000002";
const BUSINESS: DirectoryRef = { placeId: "k7m2q9a", listingKey: null };
const OWNER = {
  kind: "owner",
  user: { id: "u1", email: "a@b.test", name: "Anita Kulkarni", emailConfirmed: true, phone: null },
  tenant: { userId: "u1", businessId: "b1", businessName: "Smile Dental", role: "owner" },
  business: BUSINESS,
} as Extract<OwnedBusiness, { kind: "owner" }>;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: true } as Awaited<ReturnType<typeof consumeRateLimit>>);
});

describe("postReply", () => {
  it("saves the cleaned text for the owner's own business, refreshes the website, and says when", async () => {
    vi.mocked(postOwnerReply).mockResolvedValue({ commentId: COMMENT });
    const outcome = await postReply(OWNER, { reviewId: REVIEW, text: "  Thank you!\r\n" }, NOW);

    expect(outcome).toEqual({ kind: "saved", reply: { id: COMMENT, text: "Thank you!", createdAt: NOW.toISOString(), edited: false } });
    expect(postOwnerReply).toHaveBeenCalledWith(DB, {
      business: BUSINESS,
      reviewId: REVIEW,
      owner: { userId: "u1", name: "Anita Kulkarni" },
      text: "Thank you!",
      now: NOW,
    });
    expect(scheduleWebsiteRefresh).toHaveBeenCalledWith(BUSINESS);
  });

  it("refuses an empty or too long reply before it spends a rate limit or touches the database", async () => {
    expect(await postReply(OWNER, { reviewId: REVIEW, text: "   " }, NOW)).toEqual({ kind: "invalid", message: "Write your reply." });
    expect(await postReply(OWNER, { reviewId: REVIEW, text: "a".repeat(501) }, NOW)).toMatchObject({ kind: "invalid" });
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(postOwnerReply).not.toHaveBeenCalled();
  });

  it("stops an owner replying faster than a person could", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValue({ allowed: false } as Awaited<ReturnType<typeof consumeRateLimit>>);
    expect(await postReply(OWNER, { reviewId: REVIEW, text: "Thanks" }, NOW)).toEqual({ kind: "limited" });
    expect(postOwnerReply).not.toHaveBeenCalled();
  });

  it("says not found, and does not refresh the website, for a review that is not this business's", async () => {
    vi.mocked(postOwnerReply).mockResolvedValue(null);
    expect(await postReply(OWNER, { reviewId: REVIEW, text: "Thanks" }, NOW)).toEqual({ kind: "not_found" });
    expect(scheduleWebsiteRefresh).not.toHaveBeenCalled();
  });

  it("fails quietly, without a refresh, when the database does", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(postOwnerReply).mockRejectedValue(new Error("connection lost"));
    expect(await postReply(OWNER, { reviewId: REVIEW, text: "Thanks" }, NOW)).toEqual({ kind: "failed" });
    expect(scheduleWebsiteRefresh).not.toHaveBeenCalled();
  });
});

describe("changeReply", () => {
  it("keeps the answer's first posting time and says it was edited", async () => {
    const postedAt = new Date("2026-10-12T08:00:00.000Z");
    vi.mocked(editOwnerReply).mockResolvedValue(postedAt);
    const outcome = await changeReply(OWNER, { commentId: COMMENT, text: "Updated" }, NOW);

    expect(outcome).toEqual({ kind: "saved", reply: { id: COMMENT, text: "Updated", createdAt: postedAt.toISOString(), edited: true } });
    expect(editOwnerReply).toHaveBeenCalledWith(DB, { business: BUSINESS, commentId: COMMENT, text: "Updated", now: NOW });
    expect(scheduleWebsiteRefresh).toHaveBeenCalledWith(BUSINESS);
  });

  it("says not found for an answer that is not the owner's to change", async () => {
    vi.mocked(editOwnerReply).mockResolvedValue(null);
    expect(await changeReply(OWNER, { commentId: COMMENT, text: "Updated" }, NOW)).toEqual({ kind: "not_found" });
    expect(scheduleWebsiteRefresh).not.toHaveBeenCalled();
  });

  it("refuses a blank edit", async () => {
    expect(await changeReply(OWNER, { commentId: COMMENT, text: "" }, NOW)).toMatchObject({ kind: "invalid" });
    expect(editOwnerReply).not.toHaveBeenCalled();
  });
});

describe("takeDownReply", () => {
  it("takes the answer down in the owner's name and refreshes the website", async () => {
    vi.mocked(removeOwnerReply).mockResolvedValue(true);
    expect(await takeDownReply(OWNER, { commentId: COMMENT }, NOW)).toEqual({ kind: "removed" });
    expect(removeOwnerReply).toHaveBeenCalledWith(DB, { business: BUSINESS, commentId: COMMENT, ownerUserId: "u1", now: NOW });
    expect(scheduleWebsiteRefresh).toHaveBeenCalledWith(BUSINESS);
  });

  it("says not found for an answer that is not the owner's to take down", async () => {
    vi.mocked(removeOwnerReply).mockResolvedValue(false);
    expect(await takeDownReply(OWNER, { commentId: COMMENT }, NOW)).toEqual({ kind: "not_found" });
    expect(scheduleWebsiteRefresh).not.toHaveBeenCalled();
  });
});
