import { createLead } from "@brandbasket/db";
import { redirect } from "next/navigation";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getStaffDb } from "@/lib/server/db";
import { requireStaffAccess, type GrantedStaff } from "@/lib/server/staff-access";
import { recordStaffAction } from "@/lib/server/activity";
import { createLeadAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({ redirect: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return { ...actual, createLead: vi.fn() };
});
vi.mock("@/lib/server/db", () => ({ getStaffDb: vi.fn() }));
vi.mock("@/lib/server/staff-access", () => ({ requireStaffAccess: vi.fn() }));
vi.mock("@/lib/server/activity", () => ({ recordStaffAction: vi.fn() }));

const DB = { name: "staff-db" } as unknown as ReturnType<typeof getStaffDb>;
const STAFF = { user: { id: "staff-1" }, staff: { userId: "staff-1", role: "support" } } as unknown as GrantedStaff;
const IDLE = { status: "idle" } as const;
const LEAD_ID = "0198f2c0-0000-7000-8000-0000000000aa";

const POSTED = {
  name: "Asha Rao",
  businessName: "Aster Physio",
  email: "Asha@Example.com",
  phone: "",
  phoneCountry: "IN",
  businessType: "clinic",
  message: "",
};

function form(entries: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(entries)) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireStaffAccess).mockResolvedValue(STAFF);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(createLead).mockResolvedValue({ id: LEAD_ID });
  vi.mocked(redirect).mockImplementation((url: string) => {
    throw new Error(`redirect:${url}`);
  });
});

describe("createLeadAction", () => {
  it("adds a lead with an email and no phone number, billed in USD since nothing places it in India", async () => {
    await expect(createLeadAction(IDLE, form(POSTED))).rejects.toThrow(`redirect:/leads/${LEAD_ID}`);
    expect(createLead).toHaveBeenCalledWith(DB, expect.objectContaining({ email: "asha@example.com", phone: null, currency: "USD" }));
    expect(recordStaffAction).toHaveBeenCalledWith(STAFF, { businessId: null, kind: "lead.created", summary: "Added an enquiry", data: { leadId: LEAD_ID } });
  });

  it("still keeps a phone number when one is given, and bills an Indian number in INR", async () => {
    await expect(createLeadAction(IDLE, form({ ...POSTED, phone: "98765 43210" }))).rejects.toThrow("redirect:/leads/");
    expect(createLead).toHaveBeenCalledWith(DB, expect.objectContaining({ phone: "+919876543210", currency: "INR" }));
  });

  it("asks for the email, and says so on the email field, when it is missing", async () => {
    const outcome = await createLeadAction(IDLE, form({ ...POSTED, email: "" }));
    expect(outcome).toMatchObject({ status: "error", field: "email", message: "Enter your email address." });
    expect(createLead).not.toHaveBeenCalled();
  });

  it("refuses a phone number that is typed but is not one", async () => {
    const outcome = await createLeadAction(IDLE, form({ ...POSTED, phone: "call me" }));
    expect(outcome).toMatchObject({ status: "error", field: "phone" });
    expect(createLead).not.toHaveBeenCalled();
  });

  it("records a lead staff typed in as added after a call", async () => {
    await expect(createLeadAction(IDLE, form(POSTED))).rejects.toThrow("redirect:/leads/");
    expect(createLead).toHaveBeenCalledWith(DB, expect.objectContaining({ source: "staff" }));
  });
});
