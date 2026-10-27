import { assignLead, listAssignableSupportStaff, setLeadStatusUnlessSystemSet } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "@/lib/server/db";
import { recordStaffAction } from "@/lib/server/activity";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { assignLeadAction, setEnquiryStatusAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, assignLead: vi.fn(), listAssignableSupportStaff: vi.fn(), setLeadStatusUnlessSystemSet: vi.fn() };
});
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/invites", () => ({ sendSetupLink: vi.fn() }));
vi.mock("@/lib/server/lead-repair", () => ({ attachAccountAndSyncTenant: vi.fn() }));
vi.mock("@/lib/server/lead-updates", () => ({ applyLeadDetails: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));

const DB = { name: "staff-db" } as unknown as ReturnType<typeof getStaffDb>;
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const LEAD_ID = "0198f2c0-0000-7000-8000-0000000000aa";

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(setLeadStatusUnlessSystemSet).mockResolvedValue("updated");
  vi.mocked(assignLead).mockResolvedValue(true);
  vi.mocked(listAssignableSupportStaff).mockResolvedValue([{ userId: "staff-2", name: "Ananya Kulkarni" }]);
});

describe("setEnquiryStatusAction", () => {
  it.each([["call_done"], ["lost"]])("moves the enquiry to %s and refreshes the inbox", async (status) => {
    await setEnquiryStatusAction(form({ leadId: LEAD_ID, status }));
    expect(setLeadStatusUnlessSystemSet).toHaveBeenCalledWith(DB, LEAD_ID, status);
    expect(revalidatePath).toHaveBeenCalledWith(`/leads/${LEAD_ID}`);
    expect(revalidatePath).toHaveBeenCalledWith("/leads");
  });

  it("refuses any other status, writing nothing", async () => {
    await expect(setEnquiryStatusAction(form({ leadId: LEAD_ID, status: "paid" }))).rejects.toThrow("Not an enquiry status");
    expect(setLeadStatusUnlessSystemSet).not.toHaveBeenCalled();
  });
});

describe("assignLeadAction", () => {
  it("gives the enquiry to an active staff member", async () => {
    await assignLeadAction(form({ leadId: LEAD_ID, assignee: "staff-2" }));
    expect(assignLead).toHaveBeenCalledWith(DB, LEAD_ID, "staff-2");
  });

  it("gives it to nobody when no one is chosen", async () => {
    await assignLeadAction(form({ leadId: LEAD_ID, assignee: "" }));
    expect(assignLead).toHaveBeenCalledWith(DB, LEAD_ID, null);
  });

  it("refuses someone who is not an active staff member", async () => {
    await expect(assignLeadAction(form({ leadId: LEAD_ID, assignee: "staff-gone" }))).rejects.toThrow("active staff member");
    expect(assignLead).not.toHaveBeenCalled();
  });
});

describe("activity for enquiry changes", () => {
  it("records marking an enquiry lost", async () => {
    await setEnquiryStatusAction(form({ leadId: LEAD_ID, status: "lost" }));
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, { businessId: null, kind: "lead.status_changed", summary: "Marked lost", data: { leadId: LEAD_ID, status: "lost" } });
  });

  it("records marking an enquiry talking", async () => {
    await setEnquiryStatusAction(form({ leadId: LEAD_ID, status: "call_done" }));
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, { businessId: null, kind: "lead.status_changed", summary: "Marked talking", data: { leadId: LEAD_ID, status: "call_done" } });
  });

  it("records giving an enquiry an owner, and taking it away", async () => {
    await assignLeadAction(form({ leadId: LEAD_ID, assignee: "staff-2" }));
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, { businessId: null, kind: "lead.assigned", summary: "Gave the enquiry an owner", data: { leadId: LEAD_ID, assignee: "staff-2" } });
    await assignLeadAction(form({ leadId: LEAD_ID, assignee: "" }));
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, { businessId: null, kind: "lead.assigned", summary: "Took the enquiry off its owner", data: { leadId: LEAD_ID, assignee: null } });
  });

  it("records nothing when the change is refused", async () => {
    await expect(setEnquiryStatusAction(form({ leadId: LEAD_ID, status: "paid" }))).rejects.toThrow();
    expect(recordStaffAction).not.toHaveBeenCalled();
  });
});

