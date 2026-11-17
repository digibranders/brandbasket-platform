import { SupportQueryError } from "@brandbasket/db";
import type { SupportStatus } from "@brandbasket/shared/lib/support";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTicketStatusActions } from "./ticket-status-actions";

vi.mock("server-only", () => ({}));

const TICKET = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

function setup(status: SupportStatus | null, version = 4) {
  const updateTicket = vi.fn().mockResolvedValue({});
  const revalidate = vi.fn();
  const reportUnexpected = vi.fn().mockResolvedValue("ref-1");
  const actions = createTicketStatusActions({
    requireStaff: async () => ({ user: { id: "staff-1" } }),
    readTicket: async () => (status === null ? null : { status, version }),
    updateTicket,
    revalidate,
    reportUnexpected,
  });
  return { actions, updateTicket, revalidate, reportUnexpected };
}

beforeEach(() => vi.clearAllMocks());

describe("close", () => {
  it("sets an open request to Resolved at its current version, and says what it was", async () => {
    const { actions, updateTicket, revalidate } = setup("in_progress");
    expect(await actions.close(TICKET)).toEqual({ ok: true, previous: "in_progress", current: "resolved" });
    expect(updateTicket).toHaveBeenCalledWith({ staffUserId: "staff-1", ticketId: TICKET, expectedVersion: 4, status: "resolved" });
    expect(revalidate).toHaveBeenCalledWith(TICKET);
  });

  it("refuses a request that is already closed, and changes nothing", async () => {
    const { actions, updateTicket } = setup("closed");
    expect(await actions.close(TICKET)).toEqual({ ok: false, message: "This request is already closed." });
    expect(updateTicket).not.toHaveBeenCalled();
  });

  it("refuses an id that is not one, and a request that is not there", async () => {
    expect((await setup("new").actions.close("nope")).ok).toBe(false);
    expect(await setup(null).actions.close(TICKET)).toEqual({ ok: false, message: "That request could not be found." });
  });
});

describe("reopen", () => {
  it("moves a Resolved request to Triaged", async () => {
    const { actions, updateTicket } = setup("resolved");
    expect(await actions.reopen(TICKET)).toEqual({ ok: true, previous: "resolved", current: "triaged" });
    expect(updateTicket).toHaveBeenCalledWith(expect.objectContaining({ status: "triaged" }));
  });

  it("says a Closed request cannot be reopened here, and an open one is already open", async () => {
    expect(await setup("closed").actions.reopen(TICKET)).toEqual({ ok: false, message: "A closed request cannot be reopened here." });
    expect(await setup("new").actions.reopen(TICKET)).toEqual({ ok: false, message: "This request is already open." });
  });
});

describe("restore", () => {
  it("puts a Resolved request back to the status it had when that can be reached", async () => {
    const { actions, updateTicket } = setup("resolved");
    expect(await actions.restore(TICKET, "in_progress")).toMatchObject({ ok: true, current: "in_progress" });
    expect(updateTicket).toHaveBeenCalledWith(expect.objectContaining({ status: "in_progress" }));
  });

  it("falls back to Triaged for a status a Resolved request cannot go back to", async () => {
    const { actions, updateTicket } = setup("resolved");
    expect(await actions.restore(TICKET, "new")).toMatchObject({ ok: true, current: "triaged" });
    expect(updateTicket).toHaveBeenCalledWith(expect.objectContaining({ status: "triaged" }));
  });

  it("does nothing when the request is already there, and refuses a status that does not exist", async () => {
    const { actions, updateTicket } = setup("triaged");
    expect(await actions.restore(TICKET, "triaged")).toMatchObject({ ok: true });
    expect(updateTicket).not.toHaveBeenCalled();
    expect((await actions.restore(TICKET, "bogus")).ok).toBe(false);
  });
});

describe("failures", () => {
  it("words a conflict plainly", async () => {
    const { actions, updateTicket } = setup("new");
    updateTicket.mockRejectedValue(new SupportQueryError("conflict", "x"));
    expect(await actions.close(TICKET)).toEqual({ ok: false, message: "This request changed. Reload the list and try again." });
  });

  it("reports anything unexpected and gives the reference, never the error text", async () => {
    const { actions, updateTicket, reportUnexpected } = setup("new");
    updateTicket.mockRejectedValue(new Error("connection string leaked"));
    const result = await actions.close(TICKET);
    expect(result).toEqual({ ok: false, message: "The change did not save. Nothing was changed. Reference ref-1." });
    expect(reportUnexpected).toHaveBeenCalledOnce();
  });
});
