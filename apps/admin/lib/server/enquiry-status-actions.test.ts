import type { LeadStatus, LeadStatusChange } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createEnquiryActions } from "./enquiry-status-actions";

vi.mock("server-only", () => ({}));

const LEAD = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

function setup(lead: { status: LeadStatus; hasBusiness?: boolean } | null, outcome: LeadStatusChange = "updated") {
  const setStatus = vi.fn().mockResolvedValue(outcome);
  const sendLink = vi.fn().mockResolvedValue(undefined);
  const record = vi.fn().mockResolvedValue(undefined);
  const revalidate = vi.fn();
  const actions = createEnquiryActions({
    requireStaff: async () => ({ user: { id: "staff-1" } }),
    readLead: async () => (lead === null ? null : { status: lead.status, email: "asha@example.com", hasBusiness: lead.hasBusiness ?? false }),
    setStatus,
    sendLink,
    record,
    revalidate,
  });
  return { actions, setStatus, sendLink, record, revalidate };
}

beforeEach(() => vi.clearAllMocks());

describe("markContacted", () => {
  it("moves a new enquiry to call_done, records it, and says what it was", async () => {
    const { actions, setStatus, record, revalidate } = setup({ status: "new" });
    expect(await actions.markContacted(LEAD)).toEqual({ ok: true, previous: "new", current: "call_done" });
    expect(setStatus).toHaveBeenCalledWith(LEAD, "call_done");
    expect(record).toHaveBeenCalledWith({ user: { id: "staff-1" } }, { kind: "lead.status_changed", summary: "Marked contacted", data: { leadId: LEAD, status: "call_done" } });
    expect(revalidate).toHaveBeenCalledWith(LEAD);
  });

  it("refuses any other status and writes nothing", async () => {
    const { actions, setStatus } = setup({ status: "account_created" });
    expect(await actions.markContacted(LEAD)).toEqual({ ok: false, message: "Only a new enquiry can be marked contacted." });
    expect(setStatus).not.toHaveBeenCalled();
  });

  it("says so when the database refuses because the system moved the lead on", async () => {
    const { actions, record } = setup({ status: "new" }, "system-set");
    expect(await actions.markContacted(LEAD)).toEqual({ ok: false, message: "This enquiry has moved on. Reload the list and try again." });
    expect(record).not.toHaveBeenCalled();
  });

  it("refuses an id that is not one, and an enquiry that is not there", async () => {
    expect(await setup({ status: "new" }).actions.markContacted("nope")).toEqual({ ok: false, message: "That enquiry could not be found." });
    expect(await setup(null).actions.markContacted(LEAD)).toEqual({ ok: false, message: "That enquiry could not be found." });
  });

  it("turns an unexpected failure into a plain line", async () => {
    const { actions, setStatus } = setup({ status: "new" });
    setStatus.mockRejectedValue(new Error("db down"));
    expect(await actions.markContacted(LEAD)).toEqual({ ok: false, message: "The change did not save. Nothing was changed." });
  });
});

describe("markLost and restore", () => {
  it("marks lost, and refuses a lead that is already lost or set by the system", async () => {
    expect(await setup({ status: "call_done" }).actions.markLost(LEAD)).toEqual({ ok: true, previous: "call_done", current: "lost" });
    expect((await setup({ status: "lost" }).actions.markLost(LEAD)).ok).toBe(false);
    expect((await setup({ status: "paid" }).actions.markLost(LEAD)).ok).toBe(false);
  });

  it("restores a staff status, and refuses one staff may not choose", async () => {
    const { actions, setStatus } = setup({ status: "call_done" });
    expect(await actions.restore(LEAD, "new")).toEqual({ ok: true, previous: "call_done", current: "new" });
    expect(setStatus).toHaveBeenCalledWith(LEAD, "new");
    expect(await actions.restore(LEAD, "paid")).toEqual({ ok: false, message: "That status is not one an enquiry can go back to." });
  });

  it("counts a system-set lead as a failed undo", async () => {
    expect((await setup({ status: "call_done" }, "system-set").actions.restore(LEAD, "new")).ok).toBe(false);
  });
});

describe("sendSetupLink", () => {
  it("sends the link, records it and names the address", async () => {
    const { actions, sendLink, record } = setup({ status: "new" });
    expect(await actions.sendSetupLink(LEAD)).toEqual({ ok: true, email: "asha@example.com" });
    expect(sendLink).toHaveBeenCalledWith(LEAD, "staff-1");
    expect(record).toHaveBeenCalledWith({ user: { id: "staff-1" } }, { kind: "lead.setup_link_sent", summary: "Sent the setup link", data: { leadId: LEAD } });
  });

  it("does not send to someone who already has a website", async () => {
    const { actions, sendLink } = setup({ status: "account_created", hasBusiness: true });
    expect((await actions.sendSetupLink(LEAD)).ok).toBe(false);
    expect(sendLink).not.toHaveBeenCalled();
  });

  it("warns that the earlier link may be gone when the send fails", async () => {
    const { actions, sendLink } = setup({ status: "new" });
    sendLink.mockRejectedValue(new Error("smtp"));
    const result = await actions.sendSetupLink(LEAD);
    expect(result.ok).toBe(false);
    expect(result.ok ? "" : result.message).toContain("earlier link may no longer work");
  });
});
