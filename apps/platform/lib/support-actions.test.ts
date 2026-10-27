import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), reply: vi.fn(), read: vi.fn(), limit: vi.fn(), revalidate: vi.fn(), replyAlert: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/server/support-access", () => ({ getSupportAccess: mocks.access }));
vi.mock("@/lib/server/db", () => ({ getAppDb: () => ({}), getStaffDb: () => ({}) }));
vi.mock("@/lib/server/error-report", () => ({ reportServerError: vi.fn() }));
vi.mock("@/lib/server/support-alerts", () => ({ sendSupportReplyAlert: mocks.replyAlert }));
vi.mock("@brandbasket/db", () => ({ appendSupportReplyWithOutcome: mocks.reply, markSupportTicketRead: mocks.read, consumeRateLimit: mocks.limit, SupportQueryError: class extends Error {} }));
import { acknowledgeSupportReplies, replyToSupportRequest } from "@/app/app-host/(support)/support/actions";
import { INITIAL_SUPPORT_STATE } from "./support-form-state";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ user: { id: "signed-in-person" }, businessId: null, businessName: null });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.reply.mockResolvedValue({ message: { id: "message-id" }, created: true });
  mocks.replyAlert.mockResolvedValue(undefined);
});

describe("support replies and read receipts", () => {
  it("acknowledges a visible conversation only under the signed-in account", async () => {
    const ticketId = "00000000-0000-4000-8000-000000000001";
    const messageId = "00000000-0000-4000-8000-000000000002";
    expect(await acknowledgeSupportReplies(ticketId, messageId)).toBe(true);
    expect(mocks.read).toHaveBeenCalledWith({}, "signed-in-person", ticketId, messageId);
    expect(mocks.revalidate).toHaveBeenCalledWith("/requests");
  });
  it("refuses malformed receipts and signed-out reads", async () => {
    expect(await acknowledgeSupportReplies("-".repeat(36), "-".repeat(36))).toBe(false);
    mocks.access.mockResolvedValue(null);
    expect(await acknowledgeSupportReplies("00000000-0000-4000-8000-000000000001", "00000000-0000-4000-8000-000000000002")).toBe(false);
    expect(mocks.read).not.toHaveBeenCalled();
  });
  it("alerts once for a reply and not for a replayed reply", async () => {
    const form = new FormData();
    form.set("body", "More detail"); form.set("submissionKey", "reply_submission_1"); form.set("ticketId", "00000000-0000-4000-8000-000000000001");
    await replyToSupportRequest(INITIAL_SUPPORT_STATE, form);
    expect(mocks.replyAlert).toHaveBeenCalledTimes(1);
    mocks.replyAlert.mockClear();
    mocks.reply.mockResolvedValue({ message: { id: "message-id" }, created: false });
    await replyToSupportRequest(INITIAL_SUPPORT_STATE, form);
    expect(mocks.replyAlert).not.toHaveBeenCalled();
  });
  it("offers only the two actions the Requests page still calls: every exported server action can be called by anyone", async () => {
    const actions = await import("@/app/app-host/(support)/support/actions");
    expect(Object.keys(actions).sort()).toEqual(["acknowledgeSupportReplies", "replyToSupportRequest"]);
  });
});
