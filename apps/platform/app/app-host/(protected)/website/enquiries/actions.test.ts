import { findEnquiry, updateEnquiry, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireWebsiteClient } from "@/lib/server/customer-access";
import { saveEnquiryAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@brandbasket/db", () => {
  class EnquiryNoteTooLongError extends Error {}
  return { EnquiryNoteTooLongError, findEnquiry: vi.fn(), updateEnquiry: vi.fn(), withTenantScope: vi.fn() };
});
vi.mock("@/lib/server/customer-access", () => ({ requireWebsiteClient: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("@/lib/server/chatbot-conversations", () => ({ loadLeadConversation: vi.fn() }));
vi.mock("@/lib/server/chatbots", () => ({ renameCustomerChatbot: vi.fn() }));

const ID = "0192f3c4-0000-7000-8000-0000000000aa";
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" };
const tx = { name: "tx" } as never;
const PREVIOUS = { status: "idle" } as const;

function form(fields: Record<string, string> = {}): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries({ id: ID, status: "contacted", note: "  Rang back  ", ...fields })) data.set(name, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireWebsiteClient).mockResolvedValue({ tenant, billing: { hasAccess: true } } as never);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _tenant, work) => work(tx));
  vi.mocked(findEnquiry).mockResolvedValue({ id: ID, kind: "chat", name: "Asha", phone: null, email: null, message: null } as never);
  vi.mocked(updateEnquiry).mockResolvedValue({ id: ID } as never);
});

describe("saveEnquiryAction", () => {
  it("saves the status and the trimmed note under the session's tenant and refreshes the page", async () => {
    await expect(saveEnquiryAction(PREVIOUS, form())).resolves.toEqual({ status: "saved" });
    expect(withTenantScope).toHaveBeenCalledWith({ kind: "app-db" }, tenant, expect.any(Function));
    expect(updateEnquiry).toHaveBeenCalledWith(tx, ID, { status: "contacted", note: "Rang back" });
    expect(revalidatePath).toHaveBeenCalledWith("/website/enquiries");
  });

  it("refuses a viewer without writing", async () => {
    vi.mocked(requireWebsiteClient).mockResolvedValue({ tenant: { ...tenant, role: "viewer" }, billing: { hasAccess: true } } as never);
    const result = await saveEnquiryAction(PREVIOUS, form());
    expect(result).toMatchObject({ status: "error", message: "Only owners and editors can change this." });
    expect(updateEnquiry).not.toHaveBeenCalled();
  });

  it("refuses an unpaid business without writing", async () => {
    vi.mocked(requireWebsiteClient).mockResolvedValue({ tenant, billing: { hasAccess: false } } as never);
    expect(await saveEnquiryAction(PREVIOUS, form())).toMatchObject({ status: "error" });
    expect(updateEnquiry).not.toHaveBeenCalled();
  });

  it("refuses a bad id or status", async () => {
    expect(await saveEnquiryAction(PREVIOUS, form({ id: "nope" }))).toMatchObject({ status: "error", field: null });
    expect(await saveEnquiryAction(PREVIOUS, form({ status: "counted" }))).toMatchObject({ status: "error", field: null });
    expect(updateEnquiry).not.toHaveBeenCalled();
  });

  it("refuses a note over 1,000 characters beside the note field, echoing what was typed", async () => {
    const note = "x".repeat(1001);
    const result = await saveEnquiryAction(PREVIOUS, form({ note }));
    expect(result).toMatchObject({ status: "error", field: "note", message: "Keep the note to 1000 characters or fewer.", values: { note } });
    expect(updateEnquiry).not.toHaveBeenCalled();
  });

  it("says not found for an enquiry of another business or one that is only counted", async () => {
    vi.mocked(findEnquiry).mockResolvedValue(null);
    expect(await saveEnquiryAction(PREVIOUS, form())).toMatchObject({ status: "error", message: "We could not find that enquiry." });
    vi.mocked(findEnquiry).mockResolvedValue({ id: ID, kind: "call_tap", name: null, phone: null, email: null, message: null } as never);
    expect(await saveEnquiryAction(PREVIOUS, form())).toMatchObject({ status: "error", message: "We could not find that enquiry." });
    expect(updateEnquiry).not.toHaveBeenCalled();
  });

  it("says not found when row-level security leaves the row untouched", async () => {
    vi.mocked(updateEnquiry).mockResolvedValue(null);
    expect(await saveEnquiryAction(PREVIOUS, form())).toMatchObject({ status: "error", message: "We could not find that enquiry." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("lets any other failure through", async () => {
    vi.mocked(updateEnquiry).mockRejectedValue(new Error("db down"));
    await expect(saveEnquiryAction(PREVIOUS, form())).rejects.toThrow("db down");
  });
});
