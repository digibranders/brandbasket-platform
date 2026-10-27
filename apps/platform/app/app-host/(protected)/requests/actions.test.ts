import { createSupportTicketWithOutcome, SupportQueryError } from "@brandbasket/db";
import { revalidatePath } from "next/cache";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { reportServerError } from "@/lib/server/error-report";
import { loadSetupServices } from "@/lib/server/first-look";
import { sendSupportTicketAlert } from "@/lib/server/support-alerts";
import { supportRateLimit } from "@/lib/server/support-limits";
import { canCreateSupportRequest } from "@/lib/server/support-rollout";
import { INITIAL_SUPPORT_STATE } from "@/lib/support-form-state";
import { askForChangeAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/navigation", () => ({ unstable_rethrow: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(() => ({ kind: "app-db" })) }));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/first-look", () => ({ loadSetupServices: vi.fn() }));
vi.mock("@/lib/server/error-report", () => ({ reportServerError: vi.fn() }));
vi.mock("@/lib/server/support-alerts", () => ({ sendSupportTicketAlert: vi.fn() }));
vi.mock("@/lib/server/support-limits", () => ({ supportRateLimit: vi.fn() }));
vi.mock("@/lib/server/support-rollout", () => ({ canCreateSupportRequest: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/db")>()), createSupportTicketWithOutcome: vi.fn() }));

const user = { id: "user-1", name: "Priya Shah", email: "priya@example.com", phone: null };
const tenant = { userId: "user-1", businessId: "business-1", businessName: "Sai Dental Care", role: "owner" };
const KEY = "ask-key-12345678";

function form(fields: Record<string, string>): FormData {
  const data = new FormData();
  for (const [name, value] of Object.entries(fields)) data.set(name, value);
  return data;
}

const GOOD = { kind: "website", page: "Home", body: "Add an Implants page. Same style as the root canal page.", submissionKey: KEY };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(requireCustomerAccess).mockResolvedValue({ user, tenant, billing: { hasAccess: true, hasWebsite: true } } as never);
  vi.mocked(canCreateSupportRequest).mockReturnValue(true);
  vi.mocked(loadSetupServices).mockResolvedValue(["website"]);
  vi.mocked(supportRateLimit).mockResolvedValue(null);
  vi.mocked(createSupportTicketWithOutcome).mockResolvedValue({ ticket: { id: "ticket-1", displayRef: "FY-1" }, created: true } as never);
  vi.mocked(sendSupportTicketAlert).mockResolvedValue(undefined);
});

describe("askForChangeAction", () => {
  it("sends the request as the signed-in person for their own business, whatever the form says about either", async () => {
    const state = await askForChangeAction(INITIAL_SUPPORT_STATE, form({ ...GOOD, businessId: "someone-elses", userId: "someone-else" }));
    expect(state).toMatchObject({ status: "saved", ticketId: "ticket-1", reference: "FY-1", message: "Sent. We will reply here." });
    expect(createSupportTicketWithOutcome).toHaveBeenCalledWith(
      { kind: "app-db" },
      {
        userId: "user-1",
        businessId: "business-1",
        category: "website_change",
        subject: "Add an Implants page",
        description: "Add an Implants page. Same style as the root canal page.",
        details: { pageUrl: "Home" },
        attachmentIds: [],
        submissionKey: KEY,
        changeRequest: { kind: "website", page: "Home" },
      },
    );
    expect(revalidatePath).toHaveBeenCalledWith("/requests");
    expect(revalidatePath).toHaveBeenCalledWith("/");
  });

  it("files a Billing request under billing and keeps no page", async () => {
    await askForChangeAction(INITIAL_SUPPORT_STATE, form({ kind: "billing", page: "Home", body: "Put my GST number on the invoice.", submissionKey: KEY }));
    const input = vi.mocked(createSupportTicketWithOutcome).mock.calls[0]?.[1];
    expect(input).toMatchObject({ category: "billing", changeRequest: { kind: "billing", page: null } });
    expect(input).not.toHaveProperty("details");
  });

  it("offers only the services the customer bought", async () => {
    const state = await askForChangeAction(INITIAL_SUPPORT_STATE, form({ kind: "social", body: "Change the wording of my ad.", submissionKey: KEY }));
    expect(state).toMatchObject({ status: "error", field: "kind", message: "Choose what this is about." });
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
    vi.mocked(loadSetupServices).mockResolvedValue(["website", "social"]);
    expect((await askForChangeAction(INITIAL_SUPPORT_STATE, form({ kind: "social", body: "Change the wording of my ad.", submissionKey: KEY }))).status).toBe("saved");
  });

  it("offers only Billing and Something else when the services cannot be read", async () => {
    vi.mocked(loadSetupServices).mockResolvedValue(null);
    expect((await askForChangeAction(INITIAL_SUPPORT_STATE, form(GOOD))).status).toBe("error");
    expect((await askForChangeAction(INITIAL_SUPPORT_STATE, form({ kind: "other", body: "Something else entirely, please.", submissionKey: KEY }))).status).toBe("saved");
  });

  it("returns what was wrong with the form and sends nothing", async () => {
    const state = await askForChangeAction(INITIAL_SUPPORT_STATE, form({ ...GOOD, body: "Short" }));
    expect(state).toMatchObject({ status: "error", field: "body", message: "Say what you want changed, in at least 10 characters." });
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
    expect(supportRateLimit).not.toHaveBeenCalled();
  });

  it("stops at the rate limit with its sentence, and while new requests are switched off", async () => {
    vi.mocked(supportRateLimit).mockResolvedValue("Please wait 60 seconds before sending another request.");
    expect(await askForChangeAction(INITIAL_SUPPORT_STATE, form(GOOD))).toMatchObject({ status: "error", message: "Please wait 60 seconds before sending another request." });
    vi.mocked(canCreateSupportRequest).mockReturnValue(false);
    expect(await askForChangeAction(INITIAL_SUPPORT_STATE, form(GOOD))).toMatchObject({ status: "error", message: "New requests are temporarily unavailable. Please try again later." });
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
  });

  it("tells the team once: not again for a replay of the same submission", async () => {
    await askForChangeAction(INITIAL_SUPPORT_STATE, form(GOOD));
    expect(sendSupportTicketAlert).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendSupportTicketAlert).mock.calls[0]?.[0]).toEqual({ id: "ticket-1", displayRef: "FY-1" });
    expect(vi.mocked(sendSupportTicketAlert).mock.calls[0]?.[2]).toMatchObject({ businessId: "business-1", businessName: "Sai Dental Care" });
    vi.mocked(createSupportTicketWithOutcome).mockResolvedValue({ ticket: { id: "ticket-1", displayRef: "FY-1" }, created: false } as never);
    await askForChangeAction(INITIAL_SUPPORT_STATE, form(GOOD));
    expect(sendSupportTicketAlert).toHaveBeenCalledTimes(1);
  });

  it("does not fail the request when the team's alert fails", async () => {
    vi.mocked(sendSupportTicketAlert).mockRejectedValue(new Error("mail down"));
    expect((await askForChangeAction(INITIAL_SUPPORT_STATE, form(GOOD))).status).toBe("saved");
  });

  it("answers a refused ticket in plain words, and reports a fault it did not expect", async () => {
    vi.mocked(createSupportTicketWithOutcome).mockRejectedValue(new SupportQueryError("invalid_attachment", "An attachment is unavailable."));
    expect(await askForChangeAction(INITIAL_SUPPORT_STATE, form(GOOD))).toMatchObject({ status: "error", message: "Check your request and your screenshots, then try again." });
    vi.mocked(createSupportTicketWithOutcome).mockRejectedValue(new Error("db down"));
    expect(await askForChangeAction(INITIAL_SUPPORT_STATE, form(GOOD))).toMatchObject({ status: "error", message: "Your request could not be saved. What you wrote is still here; try again." });
    expect(reportServerError).toHaveBeenCalledTimes(1);
  });
});
