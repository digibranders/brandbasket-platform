import { describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { SupportQueryError } from "@brandbasket/db";
import { createStaffSupportActions } from "./support-admin-actions";

const TICKET = "0192f3c4-1111-7000-8000-000000000001";
const ISSUE = "0192f3c4-1111-7000-8000-000000000002";
function form(values: Record<string, string>): FormData { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); return data; }
function fixture() {
  const deps = { requireStaff: vi.fn().mockResolvedValue({ user: { id: "actual-staff" } }), updateTicket: vi.fn().mockResolvedValue(undefined), appendMessage: vi.fn().mockResolvedValue({ created: true }), linkError: vi.fn().mockResolvedValue(undefined), unlinkError: vi.fn().mockResolvedValue(undefined), revalidate: vi.fn(), reportUnexpected: vi.fn().mockResolvedValue(ISSUE) };
  return { deps, actions: createStaffSupportActions(deps) };
}
describe("staff support action authorization and state", () => {
  it("requires staff authorization before parsing inputs and rejects spoofed actor fields", async () => {
    const { deps, actions } = fixture();
    await actions.message(TICKET, form({ body: "Staff reply", visibility: "public", submissionKey: "staff-key-123", staffUserId: "victim" }));
    expect(deps.requireStaff).toHaveBeenCalledTimes(1);
    expect(deps.appendMessage).toHaveBeenCalledWith(expect.objectContaining({ staffUserId: "actual-staff", body: "Staff reply" }));
    deps.requireStaff.mockRejectedValue(new Error("unauthorized"));
    await expect(actions.update(TICKET, form({}))).rejects.toThrow("unauthorized");
    expect(deps.updateTicket).not.toHaveBeenCalled();
  });
  it("rejects invalid updates and propagates the reviewed optimistic version", async () => {
    const { deps, actions } = fixture();
    expect((await actions.update(TICKET, form({ status: "made-up" }))).kind).toBe("invalid");
    expect(deps.updateTicket).not.toHaveBeenCalled();
    const result = await actions.update(TICKET, form({ expectedVersion: "8", status: "in_progress", category: "bug", priority: "high", assigneeStaffId: "" }));
    expect(result.kind).toBe("saved");
    expect(deps.updateTicket).toHaveBeenCalledWith({ ticketId: TICKET, staffUserId: "actual-staff", expectedVersion: 8, status: "in_progress", category: "bug", priority: "high", assigneeStaffId: null });
  });
  it("returns safe conflicts without reporting expected failures", async () => {
    const { deps, actions } = fixture();
    deps.appendMessage.mockRejectedValue(new SupportQueryError("conflict", "This draft was already submitted differently."));
    const result = await actions.message(TICKET, form({ body: "Staff reply", visibility: "internal", submissionKey: "staff-key-123" }));
    expect(result.kind).toBe("conflict");
    expect(deps.reportUnexpected).not.toHaveBeenCalled();
  });
  it("reports unexpected failures using fixed templates and never returns raw exceptions", async () => {
    const { deps, actions } = fixture();
    const error = new Error("patient SQL secret"); deps.appendMessage.mockRejectedValue(error);
    const result = await actions.message(TICKET, form({ body: "Staff reply", visibility: "public", submissionKey: "staff-key-123" }));
    expect(result.kind).toBe("error"); expect(result.reference).toBe(ISSUE);
    expect(JSON.stringify(result)).not.toMatch(/patient|SQL|secret/);
    expect(deps.reportUnexpected).toHaveBeenCalledWith(error, "/support/[id]", "actual-staff");
  });
  it("validates private issue links and rotates message idempotency keys only after successful writes", async () => {
    const { deps, actions } = fixture();
    expect((await actions.link(TICKET, form({ issueId: "invalid" }), false)).kind).toBe("invalid");
    expect(deps.linkError).not.toHaveBeenCalled();
    expect((await actions.link(TICKET, form({ issueId: ISSUE }), true)).kind).toBe("saved");
    expect(deps.unlinkError).toHaveBeenCalledWith({ ticketId: TICKET, issueId: ISSUE, staffUserId: "actual-staff" });
    const result = await actions.message(TICKET, form({ body: "Staff reply", visibility: "public", submissionKey: "staff-key-123" }));
    expect(result.submissionKey).toMatch(/^[0-9a-f-]{36}$/);
    expect(deps.revalidate).toHaveBeenCalledWith(TICKET);
  });
  it("emails the requester about a new public reply, and says so", async () => {
    const { deps, actions } = fixture();
    const notifyReply = vi.fn().mockResolvedValue("emailed");
    const withMail = createStaffSupportActions({ ...deps, notifyReply });
    const result = await withMail.message(TICKET, form({ body: "We are on it.", visibility: "public", submissionKey: "staff-key-123" }));
    expect(notifyReply).toHaveBeenCalledWith({ ticketId: TICKET, body: "We are on it." });
    expect(result).toMatchObject({ kind: "saved", message: "Reply added to the requester’s ticket. They were emailed." });
    expect(actions).toBeDefined();
  });

  it("says when the requester could not be emailed, and keeps the reply", async () => {
    const { deps } = fixture();
    const withMail = createStaffSupportActions({ ...deps, notifyReply: vi.fn().mockResolvedValue("no-email") });
    expect((await withMail.message(TICKET, form({ body: "We are on it.", visibility: "public", submissionKey: "staff-key-123" }))).message).toContain("They have no email address, so tell them another way.");
    const failing = createStaffSupportActions({ ...deps, notifyReply: vi.fn().mockResolvedValue("failed") });
    expect((await failing.message(TICKET, form({ body: "We are on it.", visibility: "public", submissionKey: "staff-key-124" }))).message).toContain("The email could not be sent.");
  });

  it("emails nobody for an internal note, for a replay of a reply already saved, or when no one is set to be told", async () => {
    const { deps, actions } = fixture();
    const notifyReply = vi.fn().mockResolvedValue("emailed");
    const withMail = createStaffSupportActions({ ...deps, notifyReply });
    await withMail.message(TICKET, form({ body: "Only for us.", visibility: "internal", submissionKey: "staff-key-125" }));
    deps.appendMessage.mockResolvedValue({ created: false });
    await withMail.message(TICKET, form({ body: "We are on it.", visibility: "public", submissionKey: "staff-key-126" }));
    expect(notifyReply).not.toHaveBeenCalled();
    deps.appendMessage.mockResolvedValue({ created: true });
    expect((await actions.message(TICKET, form({ body: "We are on it.", visibility: "public", submissionKey: "staff-key-127" }))).message).toBe("Reply added to the requester’s ticket.");
  });
});
