import {
  changeLeadCurrency,
  findLead,
  LeadNotFoundError,
  setLeadStatusUnlessSystemSet,
  updateLead,
  type Database,
  type Lead,
  type LeadStatus,
} from "@firstfold/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { applyLeadDetails, LeadStatusNotAllowedError } from "./lead-updates";

// The database guard itself (a lead in a system status is never moved) is proven in packages/db's funnel
// integration test. What is checked here is what the form may ask for.
vi.mock("server-only", () => ({}));
vi.mock("@firstfold/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@firstfold/db")>();
  return {
    isSystemLeadStatus: actual.isSystemLeadStatus,
    LeadNotFoundError: actual.LeadNotFoundError,
    changeLeadCurrency: vi.fn(),
    findLead: vi.fn(),
    setLeadStatusUnlessSystemSet: vi.fn(),
    updateLead: vi.fn(),
  };
});

const LEAD_ID = "0192f3c4-1111-7000-8000-000000000001";
const db = { name: "staff-db" } as unknown as Database;

function lead(status: LeadStatus): Lead {
  return { id: LEAD_ID, status, currency: "USD" } as Lead;
}

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findLead).mockResolvedValue(lead("call_done"));
  vi.mocked(setLeadStatusUnlessSystemSet).mockResolvedValue("updated");
  vi.mocked(changeLeadCurrency).mockResolvedValue("changed");
});

describe("applyLeadDetails", () => {
  it("changes the status and saves the rest", async () => {
    await expect(
      applyLeadDetails(db, LEAD_ID, form({ status: "agreed", currency: "INR", notes: "  Wants June.  " })),
    ).resolves.toBe("saved");
    expect(setLeadStatusUnlessSystemSet).toHaveBeenCalledWith(db, LEAD_ID, "agreed");
    expect(changeLeadCurrency).toHaveBeenCalledWith(db, LEAD_ID, "INR");
    expect(updateLead).toHaveBeenCalledWith(db, LEAD_ID, { notes: "Wants June." });
  });

  it("leaves the status alone when it has not changed", async () => {
    await applyLeadDetails(db, LEAD_ID, form({ status: "call_done", currency: "USD", notes: "" }));
    expect(setLeadStatusUnlessSystemSet).not.toHaveBeenCalled();
    expect(changeLeadCurrency).toHaveBeenCalledWith(db, LEAD_ID, "USD");
    expect(updateLead).toHaveBeenCalledWith(db, LEAD_ID, { notes: null });
  });

  it.each(["paid", "account_created", "bogus"])("refuses the status %s by hand and writes nothing", async (status) => {
    await expect(applyLeadDetails(db, LEAD_ID, form({ status, currency: "USD" }))).rejects.toBeInstanceOf(
      LeadStatusNotAllowedError,
    );
    expect(findLead).not.toHaveBeenCalled();
    expect(setLeadStatusUnlessSystemSet).not.toHaveBeenCalled();
    expect(changeLeadCurrency).not.toHaveBeenCalled();
    expect(updateLead).not.toHaveBeenCalled();
  });

  /** A paid lead's form has no status, and no currency either: once billing starts, "Billed in" is shown locked. */
  it("saves the notes of a paid lead, whose form sends neither status nor currency", async () => {
    vi.mocked(findLead).mockResolvedValue(lead("paid"));
    await expect(applyLeadDetails(db, LEAD_ID, form({ notes: "Invoice sent" }))).resolves.toBe("saved");
    expect(setLeadStatusUnlessSystemSet).not.toHaveBeenCalled();
    expect(changeLeadCurrency).not.toHaveBeenCalled();
    expect(updateLead).toHaveBeenCalledWith(db, LEAD_ID, { notes: "Invoice sent" });
  });

  it("keeps the system's status when the lead moved on while the page was open", async () => {
    vi.mocked(setLeadStatusUnlessSystemSet).mockResolvedValue("system-set");
    await expect(applyLeadDetails(db, LEAD_ID, form({ status: "lost", currency: "USD" }))).resolves.toBe(
      "status-kept",
    );
    expect(updateLead).toHaveBeenCalledTimes(1);
  });

  it("refuses an unknown lead or currency", async () => {
    vi.mocked(findLead).mockResolvedValue(null);
    await expect(applyLeadDetails(db, LEAD_ID, form({ currency: "USD" }))).rejects.toBeInstanceOf(LeadNotFoundError);
    await expect(applyLeadDetails(db, LEAD_ID, form({ currency: "EUR" }))).rejects.toThrow(/Unknown billing currency/);
    expect(updateLead).not.toHaveBeenCalled();
    expect(changeLeadCurrency).not.toHaveBeenCalled();
  });

  /** A page left open while the customer started paying: the currency must not move under a checkout. */
  it("keeps the currency when billing started while the page was open, and still saves the notes", async () => {
    vi.mocked(changeLeadCurrency).mockResolvedValue("locked");
    await expect(applyLeadDetails(db, LEAD_ID, form({ currency: "INR", notes: "Switch to INR" }))).resolves.toBe(
      "currency-kept",
    );
    expect(updateLead).toHaveBeenCalledWith(db, LEAD_ID, { notes: "Switch to INR" });
  });
});
