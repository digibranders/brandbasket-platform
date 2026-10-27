import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ access: vi.fn(), create: vi.fn(), reply: vi.fn(), read: vi.fn(), limit: vi.fn(), revalidate: vi.fn(), ticketAlert: vi.fn(), replyAlert: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/server/support-access", () => ({ getSupportAccess: mocks.access }));
vi.mock("@/lib/server/db", () => ({ getAppDb: () => ({}), getStaffDb: () => ({}) }));
vi.mock("@/lib/server/error-report", () => ({ reportServerError: vi.fn() }));
vi.mock("@/lib/server/support-alerts", () => ({ sendSupportTicketAlert: mocks.ticketAlert, sendSupportReplyAlert: mocks.replyAlert }));
vi.mock("@brandbasket/db", () => ({ createSupportTicketWithOutcome: mocks.create, appendSupportReplyWithOutcome: mocks.reply, markSupportTicketRead: mocks.read, consumeRateLimit: mocks.limit, getSupportUnreadCount: vi.fn(), listSupportTickets: vi.fn(), SupportQueryError: class extends Error {} }));
import { acknowledgeSupportReplies, createSupportRequest, replyToSupportRequest } from "@/app/app-host/(support)/support/actions";
import { INITIAL_SUPPORT_STATE } from "./support-form-state";

function request(): FormData {
  const form = new FormData();
  form.set("category", "bug"); form.set("subject", "Booking failed"); form.set("description", "Saving a booking fails every time.");
  form.set("submissionKey", "test_submission_1"); form.set("businessId", "00000000-0000-4000-8000-000000000099");
  return form;
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.access.mockResolvedValue({ user: { id: "signed-in-person" }, businessId: null, businessName: null });
  mocks.limit.mockResolvedValue({ allowed: true });
  mocks.create.mockResolvedValue({ ticket: { id: "ticket-id", displayRef: "FY-1042" }, created: true });
  mocks.reply.mockResolvedValue({ message: { id: "message-id" }, created: true });
  mocks.ticketAlert.mockResolvedValue(undefined);
  mocks.replyAlert.mockResolvedValue(undefined);
});

describe("support submissions", () => {
  it("uses session identity and ignores business identity supplied by the form", async () => {
    const state = await createSupportRequest(INITIAL_SUPPORT_STATE, request());
    expect(state.status).toBe("saved");
    expect(mocks.create.mock.calls[0]?.[1]).toMatchObject({ userId: "signed-in-person", businessId: null, submissionKey: "test_submission_1" });
  });
  it("does not write after the session expires", async () => {
    mocks.access.mockResolvedValue(null);
    expect((await createSupportRequest(INITIAL_SUPPORT_STATE, request())).status).toBe("error");
    expect(mocks.create).not.toHaveBeenCalled();
  });
  it("preserves a failed submission and reports the retry window", async () => {
    mocks.limit.mockResolvedValue({ allowed: false, retryAfterSeconds: 60 });
    const result = await createSupportRequest(INITIAL_SUPPORT_STATE, request());
    expect(result.message).toContain("60"); expect(mocks.create).not.toHaveBeenCalled();
  });
  it("refuses an invalid description before touching persistence", async () => {
    const form = request(); form.set("description", " ");
    expect((await createSupportRequest(INITIAL_SUPPORT_STATE, form)).field).toBe("description");
    expect(mocks.create).not.toHaveBeenCalled();
  });
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
  it("alerts staff once when a request is created, and never again for a replayed submission", async () => {
    await createSupportRequest(INITIAL_SUPPORT_STATE, request());
    expect(mocks.ticketAlert).toHaveBeenCalledTimes(1);
    expect(mocks.ticketAlert.mock.calls[0]?.[0]).toMatchObject({ id: "ticket-id" });
    mocks.ticketAlert.mockClear();
    mocks.create.mockResolvedValue({ ticket: { id: "ticket-id", displayRef: "FY-1042" }, created: false });
    expect((await createSupportRequest(INITIAL_SUPPORT_STATE, request())).status).toBe("saved");
    expect(mocks.ticketAlert).not.toHaveBeenCalled();
  });
  it("passes the business name to the alert and still saves when the alert fails", async () => {
    mocks.access.mockResolvedValue({ user: { id: "signed-in-person" }, businessId: "b-1", businessName: "Smith Clinic" });
    mocks.ticketAlert.mockRejectedValue(new Error("mail down"));
    const error = vi.spyOn(console, "error").mockImplementation(() => {});
    expect((await createSupportRequest(INITIAL_SUPPORT_STATE, request())).status).toBe("saved");
    expect(mocks.ticketAlert.mock.calls[0]?.[2]).toMatchObject({ businessName: "Smith Clinic" });
    error.mockRestore();
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
});
