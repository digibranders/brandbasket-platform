import { createSupportTicketWithOutcome, findLatestProject, ProjectNotAwaitingResponseError, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb, getStaffDb } from "@/lib/server/db";
import { respondToPreview } from "@/lib/server/project-response";
import { sendSupportTicketAlert } from "@/lib/server/support-alerts";
import { supportRateLimit } from "@/lib/server/support-limits";
import { canCreateSupportRequest } from "@/lib/server/support-rollout";
import { INITIAL_SUPPORT_STATE } from "@/lib/support-form-state";
import { approvePreviewAction, sendPreviewFeedbackAction } from "./actions";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
  // The real one lets Next's own control-flow errors (a redirect) through; here a redirect is a plain Error.
  unstable_rethrow: (error: unknown) => {
    if (error instanceof Error && error.message.startsWith("REDIRECT:")) throw error;
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@brandbasket/db", () => {
  class ProjectNotAwaitingResponseError extends Error {}
  class SupportQueryError extends Error {}
  return { ProjectNotAwaitingResponseError, SupportQueryError, createSupportTicketWithOutcome: vi.fn(), findLatestProject: vi.fn(), withTenantScope: vi.fn() };
});
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("@/lib/server/error-report", () => ({ reportServerError: vi.fn() }));
vi.mock("@/lib/server/project-response", () => ({ respondToPreview: vi.fn() }));
vi.mock("@/lib/server/support-alerts", () => ({ sendSupportTicketAlert: vi.fn() }));
vi.mock("@/lib/server/support-limits", () => ({ supportRateLimit: vi.fn() }));
vi.mock("@/lib/server/support-rollout", () => ({ canCreateSupportRequest: vi.fn() }));

const staffDb = { name: "staff-db" } as never;
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant } as never);
  vi.mocked(getStaffDb).mockReturnValue(staffDb);
  vi.mocked(respondToPreview).mockResolvedValue(undefined);
});

describe("approvePreviewAction", () => {
  it("approves for the session's business only and goes back with the approved notice", async () => {
    await expect(approvePreviewAction()).rejects.toThrow("REDIRECT:/website?response=approved");
    expect(respondToPreview).toHaveBeenCalledWith(staffDb, { businessId: "business-1", businessName: "Cafe", response: { kind: "approve" } }, expect.any(Date));
  });

  it("goes back with the not-ready notice when no preview is waiting", async () => {
    vi.mocked(respondToPreview).mockRejectedValue(new ProjectNotAwaitingResponseError("project-1"));
    await expect(approvePreviewAction()).rejects.toThrow("REDIRECT:/website?response=not-ready");
  });

  it("lets any other failure through", async () => {
    vi.mocked(respondToPreview).mockRejectedValue(new Error("db down"));
    await expect(approvePreviewAction()).rejects.toThrow("db down");
  });

  it("stops a customer without access before any write", async () => {
    vi.mocked(requireCustomerAccess).mockRejectedValue(new Error("REDIRECT:/login"));
    await expect(approvePreviewAction()).rejects.toThrow("REDIRECT:/login");
    expect(respondToPreview).not.toHaveBeenCalled();
  });
});

describe("sendPreviewFeedbackAction", () => {
  const FEEDBACK = "Change the main photo on the home page, please.";
  const key = "feedback-key-12345678";

  function form(fields: Record<string, string> = {}): FormData {
    const data = new FormData();
    for (const [name, value] of Object.entries({ body: FEEDBACK, submissionKey: key, ...fields })) data.set(name, value);
    return data;
  }

  beforeEach(() => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { id: "user-a", email: "owner@example.test" }, tenant } as never);
    vi.mocked(canCreateSupportRequest).mockReturnValue(true);
    vi.mocked(supportRateLimit).mockResolvedValue(null);
    vi.mocked(getAppDb).mockReturnValue({ kind: "app-db" } as never);
    vi.mocked(withTenantScope).mockImplementation(async (_db, _tenant, work) => work({} as never));
    vi.mocked(findLatestProject).mockResolvedValue({ status: "preview", revisionRoundsGranted: 1 } as never);
    vi.mocked(createSupportTicketWithOutcome).mockResolvedValue({ ticket: { id: "ticket-1", displayRef: "FY-1" }, created: true } as never);
    vi.mocked(sendSupportTicketAlert).mockResolvedValue(undefined);
  });

  it("files plain feedback as the signed-in business, marked with its round in the subject and with no change request, then moves the project to revisions", async () => {
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=changes-sent");
    const input = vi.mocked(createSupportTicketWithOutcome).mock.calls[0]?.[1];
    expect(input).toMatchObject({
      userId: "user-a",
      businessId: "business-1",
      category: "website_change",
      subject: "Preview feedback, round 2: Change the main photo on the home page, please",
      description: FEEDBACK,
      submissionKey: key,
    });
    expect(input).not.toHaveProperty("changeRequest");
    expect(respondToPreview).toHaveBeenCalledWith(staffDb, { businessId: "business-1", businessName: "Cafe", response: { kind: "revisions" } }, expect.any(Date));
  });

  it("tells the team once, and not again when the same form is sent twice", async () => {
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=changes-sent");
    expect(sendSupportTicketAlert).toHaveBeenCalledTimes(1);
    vi.mocked(createSupportTicketWithOutcome).mockResolvedValue({ ticket: { id: "ticket-1", displayRef: "FY-1" }, created: false } as never);
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=changes-sent");
    expect(sendSupportTicketAlert).toHaveBeenCalledTimes(1);
    expect(respondToPreview).toHaveBeenCalledTimes(2);
  });

  it("sends nothing and says what was wrong when the box is too short", async () => {
    const state = await sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form({ body: "Short" }));
    expect(state).toMatchObject({ status: "error", field: "body", message: "Tell us what to change, in at least 10 characters." });
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
    expect(respondToPreview).not.toHaveBeenCalled();
  });

  it("goes back with the not-ready notice, and saves no ticket, when no preview is waiting", async () => {
    vi.mocked(findLatestProject).mockResolvedValue({ status: "building", revisionRoundsGranted: 0 } as never);
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=not-ready");
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
  });

  it("goes back with the not-ready notice when the preview was answered between the read and the move", async () => {
    vi.mocked(respondToPreview).mockRejectedValue(new ProjectNotAwaitingResponseError("project-1"));
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=not-ready");
  });

  it("stops at the rate limit with its sentence, before saving anything", async () => {
    vi.mocked(supportRateLimit).mockResolvedValue("Please wait 60 seconds before sending another request.");
    expect(await sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).toMatchObject({ status: "error", message: "Please wait 60 seconds before sending another request." });
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
  });

  it("stops a customer without access before any write", async () => {
    vi.mocked(requireCustomerAccess).mockRejectedValue(new Error("REDIRECT:/login"));
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/login");
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
    expect(respondToPreview).not.toHaveBeenCalled();
  });
});
