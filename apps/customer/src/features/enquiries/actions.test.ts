import { EnquiryNoteTooLongError, findEnquiry, renameChatbot, updateEnquiry, withTenantScope } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requirePaid, requireWebsite } from "@/lib/guards";
import { openConversationAction, renameChatbotAction, saveEnquiryAction } from "./actions";
import { loadEnquiryConversation } from "./conversation";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/db", () => ({ getAppDb: () => ({ name: "app-db" }) }));
vi.mock("@/lib/guards", () => ({ requirePaid: vi.fn(), requireWebsite: vi.fn() }));
vi.mock("./conversation", () => ({ loadEnquiryConversation: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  class EnquiryNoteTooLongError extends Error {}
  return { EnquiryNoteTooLongError, findEnquiry: vi.fn(), renameChatbot: vi.fn(), updateEnquiry: vi.fn(), withTenantScope: vi.fn() };
});

const ID = "0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b";
const tenant = { userId: "u", businessId: "business-1", businessName: "Cafe", role: "owner" };
const owner = { tenant, businessId: "business-1", role: "owner" } as never;
const viewer = { tenant, businessId: "business-1", role: "viewer" } as never;
const tx = { name: "tx" } as never;

function form(entries: Record<string, string | undefined>): FormData {
  const data = new FormData();
  for (const [key, value] of Object.entries(entries)) if (value !== undefined) data.append(key, value);
  return data;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requirePaid).mockResolvedValue(owner);
  vi.mocked(requireWebsite).mockResolvedValue(owner);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _tenant, work) => work(tx));
});

describe("saveEnquiryAction", () => {
  const person = { id: ID, kind: "chat", name: "Priya", phone: null, email: null, message: null };

  it("asks for a paid period running now, saves status and trimmed note for the session's business, and refreshes the list", async () => {
    vi.mocked(findEnquiry).mockResolvedValue(person as never);
    vi.mocked(updateEnquiry).mockResolvedValue({ id: ID } as never);

    expect(await saveEnquiryAction(null, form({ id: ID, status: "contacted", note: "  called  " }))).toEqual({ ok: true });

    expect(requirePaid).toHaveBeenCalledWith({ write: true });
    expect(withTenantScope).toHaveBeenCalledWith({ name: "app-db" }, tenant, expect.any(Function));
    expect(updateEnquiry).toHaveBeenCalledWith(tx, ID, { status: "contacted", note: "called" });
    expect(revalidatePath).toHaveBeenCalledWith("/enquiries");
  });

  it("refuses a viewer before touching the database", async () => {
    vi.mocked(requirePaid).mockResolvedValue(viewer);
    const result = await saveEnquiryAction(null, form({ id: ID, status: "won", note: "" }));
    expect(result).toEqual({ ok: false, message: "Only owners and editors can change this." });
    expect(withTenantScope).not.toHaveBeenCalled();
  });

  it("validates the form: unknown status, bad id and a note over 1000 characters", async () => {
    for (const entries of [
      { id: ID, status: "counted", note: "" },
      { id: "nope", status: "new", note: "" },
      { id: ID, status: "new", note: "x".repeat(1001) },
      { id: ID, note: "" },
    ]) {
      const result = await saveEnquiryAction(null, form(entries));
      expect(result.ok).toBe(false);
    }
    expect(updateEnquiry).not.toHaveBeenCalled();
  });

  it("says which field is wrong", async () => {
    const result = await saveEnquiryAction(null, form({ id: ID, status: "new", note: "x".repeat(1001) }));
    expect(result).toMatchObject({ ok: false, fieldErrors: { note: "Keep the note to 1000 characters or fewer." } });
  });

  it("does not change a counted row (a tap has nothing to set)", async () => {
    vi.mocked(findEnquiry).mockResolvedValue({ id: ID, kind: "call_tap", name: null, phone: null, email: null, message: null } as never);
    expect(await saveEnquiryAction(null, form({ id: ID, status: "won", note: "" }))).toEqual({ ok: false, message: "We could not find that enquiry." });
    expect(updateEnquiry).not.toHaveBeenCalled();
    expect(revalidatePath).not.toHaveBeenCalled();
  });

  it("says not found for an enquiry of another business or one the database left untouched", async () => {
    vi.mocked(findEnquiry).mockResolvedValue(null);
    expect((await saveEnquiryAction(null, form({ id: ID, status: "won", note: "" }))).ok).toBe(false);

    vi.mocked(findEnquiry).mockResolvedValue(person as never);
    vi.mocked(updateEnquiry).mockResolvedValue(null);
    expect(await saveEnquiryAction(null, form({ id: ID, status: "won", note: "" }))).toEqual({ ok: false, message: "We could not find that enquiry." });
  });

  it("turns the database's note limit into a field message", async () => {
    vi.mocked(findEnquiry).mockResolvedValue(person as never);
    vi.mocked(updateEnquiry).mockRejectedValue(new EnquiryNoteTooLongError());
    expect(await saveEnquiryAction(null, form({ id: ID, status: "won", note: "ok" }))).toMatchObject({ ok: false, fieldErrors: { note: expect.any(String) } });
  });
});

describe("openConversationAction", () => {
  it("calls its own guard and hands only the enquiry id to the server", async () => {
    vi.mocked(loadEnquiryConversation).mockResolvedValue({ status: "ok", warmth: "Warm", messages: [{ author: "visitor", text: "Hi", at: new Date("2026-11-01T10:00:00Z") }] });
    expect(await openConversationAction(ID)).toEqual({ ok: true, data: { warmth: "Warm", messages: [{ author: "visitor", text: "Hi", at: "2026-11-01T10:00:00.000Z" }] } });
    expect(requirePaid).toHaveBeenCalled();
    expect(loadEnquiryConversation).toHaveBeenCalledWith(owner, ID);
  });

  it("says the sentence for each way it can fail, and does not ask the server for a bad id", async () => {
    expect(await openConversationAction("nope")).toEqual({ ok: false, message: "This conversation is no longer available." });
    expect(loadEnquiryConversation).not.toHaveBeenCalled();
    vi.mocked(loadEnquiryConversation).mockResolvedValue({ status: "limited" });
    expect(await openConversationAction(ID)).toEqual({ ok: false, message: "You have opened a lot of conversations in a short time. Wait a minute and try again." });
    vi.mocked(loadEnquiryConversation).mockResolvedValue({ status: "unavailable" });
    expect((await openConversationAction(ID)).ok).toBe(false);
  });
});

describe("renameChatbotAction", () => {
  it("needs the Managed Website with a live period, tidies the name and scopes it to the session's business", async () => {
    vi.mocked(renameChatbot).mockResolvedValue(true);
    expect(await renameChatbotAction(null, form({ chatbotId: ID, name: "  Booking   helper " }))).toEqual({ ok: true });
    expect(requireWebsite).toHaveBeenCalledWith({ write: true });
    expect(renameChatbot).toHaveBeenCalledWith(tx, { chatbotId: ID, businessId: "business-1", name: "Booking helper" });
    expect(revalidatePath).toHaveBeenCalledWith("/enquiries");
  });

  it("refuses a viewer, a blank or long name and a bad id", async () => {
    vi.mocked(requireWebsite).mockResolvedValueOnce(viewer);
    expect((await renameChatbotAction(null, form({ chatbotId: ID, name: "Bot" }))).ok).toBe(false);
    expect(await renameChatbotAction(null, form({ chatbotId: ID, name: "   " }))).toMatchObject({ ok: false, fieldErrors: { name: "Type a name for your assistant." } });
    expect(await renameChatbotAction(null, form({ chatbotId: ID, name: "x".repeat(81) }))).toMatchObject({ ok: false, fieldErrors: { name: "Keep the name to 80 characters or fewer." } });
    expect((await renameChatbotAction(null, form({ chatbotId: "x", name: "Bot" }))).ok).toBe(false);
    expect(renameChatbot).not.toHaveBeenCalled();
  });

  it("says so when no such assistant belongs to the business", async () => {
    vi.mocked(renameChatbot).mockResolvedValue(false);
    expect(await renameChatbotAction(null, form({ chatbotId: ID, name: "Bot" }))).toEqual({ ok: false, message: "We could not find that assistant." });
    expect(revalidatePath).not.toHaveBeenCalled();
  });
});
