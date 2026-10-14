import { describe, expect, it } from "vitest";
import {
  canStaffChangeLeadStatus,
  LEAD_STATUS_LABELS,
  LEAD_STATUS_ORDER,
  readStaffLeadStatus,
  STAFF_LEAD_STATUS_ORDER,
} from "./lead-status";

describe("lead status", () => {
  it("labels every status in plain English", () => {
    expect(LEAD_STATUS_ORDER.map((status) => LEAD_STATUS_LABELS[status])).toEqual([
      "New",
      "Call booked",
      "Call done",
      "Agreed",
      "Setup link sent",
      "Account created",
      "Paid",
      "Lost",
    ]);
  });

  it("offers staff every status but the two the system sets, in pipeline order", () => {
    expect(STAFF_LEAD_STATUS_ORDER).toEqual(["new", "call_booked", "call_done", "agreed", "invite_sent", "lost"]);
  });

  it("reads only a status staff may choose", () => {
    expect(readStaffLeadStatus("agreed")).toBe("agreed");
    for (const value of ["paid", "account_created", "Paid", "", "toString"]) {
      expect(readStaffLeadStatus(value)).toBeNull();
    }
    expect(readStaffLeadStatus(null)).toBeNull();
    expect(readStaffLeadStatus(new File(["paid"], "paid"))).toBeNull();
  });

  it("locks the picker once the system has moved the lead on", () => {
    expect(canStaffChangeLeadStatus("paid")).toBe(false);
    expect(canStaffChangeLeadStatus("account_created")).toBe(false);
    expect(canStaffChangeLeadStatus("invite_sent")).toBe(true);
    expect(canStaffChangeLeadStatus("lost")).toBe(true);
  });
});
