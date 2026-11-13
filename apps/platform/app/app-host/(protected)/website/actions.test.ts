import { createSupportTicketWithOutcome, findLatestProject, linkFeedbackTicket, ProjectNotAwaitingResponseError, requestProjectRevisions, RevisionRoundsUsedUpError, SupportQueryError, withCustomerRole, withTenantScope } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import { getAppDb, getStaffDb } from "@/lib/server/db";
import { sendPreviewChangesReceived } from "@/lib/server/preview-changes-email";
import { notifyTeamPreviewResponse, respondToPreview } from "@/lib/server/project-response";
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
  class RevisionRoundsUsedUpError extends Error {}
  class SupportQueryError extends Error {}
  return { ProjectNotAwaitingResponseError, RevisionRoundsUsedUpError, SupportQueryError, createSupportTicketWithOutcome: vi.fn(), findLatestProject: vi.fn(), linkFeedbackTicket: vi.fn(), requestProjectRevisions: vi.fn(), withCustomerRole: vi.fn(), withTenantScope: vi.fn() };
});
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/db", () => ({ getAppDb: vi.fn(), getStaffDb: vi.fn() }));
vi.mock("@/lib/server/error-report", () => ({ reportServerError: vi.fn() }));
vi.mock("@/lib/server/preview-changes-email", () => ({ sendPreviewChangesReceived: vi.fn() }));
vi.mock("@/lib/server/project-response", () => ({ respondToPreview: vi.fn(), notifyTeamPreviewResponse: vi.fn() }));
vi.mock("@/lib/server/support-alerts", () => ({ sendSupportTicketAlert: vi.fn() }));
vi.mock("@/lib/server/support-limits", () => ({ supportRateLimit: vi.fn() }));
vi.mock("@/lib/server/support-rollout", () => ({ canCreateSupportRequest: vi.fn() }));

const transaction = vi.fn();
const staffDb = { name: "staff-db", transaction } as never;
const tx = { name: "tx" } as never;
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" };

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasAccess: true } } as never);
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

  it("sends a lapsed customer Home and approves nothing", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { status: "lapsed", hasAccess: false } } as never);
    await expect(approvePreviewAction()).rejects.toThrow("REDIRECT:/");
    expect(respondToPreview).not.toHaveBeenCalled();
  });
});

describe("sendPreviewFeedbackAction", () => {
  const FEEDBACK = "Change the main photo on the home page, please.";
  const key = "feedback-key-12345678";
  const MOVED = { id: "project-1", revisionRoundsGranted: 2, revisionRoundsIncluded: 2 };

  function form(fields: Record<string, string> = {}): FormData {
    const data = new FormData();
    for (const [name, value] of Object.entries({ body: FEEDBACK, submissionKey: key, ...fields })) data.set(name, value);
    return data;
  }

  beforeEach(() => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { id: "user-a", name: "Asha Rao", email: "owner@example.test" }, tenant, billing: { hasAccess: true } } as never);
    vi.mocked(canCreateSupportRequest).mockReturnValue(true);
    vi.mocked(supportRateLimit).mockResolvedValue(null);
    vi.mocked(getAppDb).mockReturnValue({ kind: "app-db" } as never);
    vi.mocked(withTenantScope).mockImplementation(async (_db, _tenant, work) => work({} as never));
    vi.mocked(findLatestProject).mockResolvedValue({ id: "project-1", status: "preview", revisionRoundsGranted: 1, revisionRoundsIncluded: 2 } as never);
    vi.mocked(createSupportTicketWithOutcome).mockResolvedValue({ ticket: { id: "ticket-1", displayRef: "FY-1" }, created: true } as never);
    vi.mocked(sendSupportTicketAlert).mockResolvedValue(undefined);
    transaction.mockImplementation(async (work: (t: never) => Promise<unknown>) => work(tx));
    vi.mocked(requestProjectRevisions).mockResolvedValue(MOVED as never);
    vi.mocked(withCustomerRole).mockImplementation(async (_tx, _scope, work) => work(tx));
    vi.mocked(sendPreviewChangesReceived).mockResolvedValue(undefined);
  });

  it("files plain feedback as the signed-in business, marked with its round in the subject and with no change request, in one transaction", async () => {
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=changes-sent");
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(requestProjectRevisions).toHaveBeenCalledWith(tx, { businessId: "business-1", now: expect.any(Date) });
    expect(withCustomerRole).toHaveBeenCalledWith(tx, { userId: "user-a", businessId: "business-1" }, expect.any(Function));
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
  });

  it("counts the round first, then links the ticket to the project and that round, all on the transaction", async () => {
    const order: string[] = [];
    vi.mocked(requestProjectRevisions).mockImplementation(async () => {
      order.push("round");
      return MOVED as never;
    });
    vi.mocked(linkFeedbackTicket).mockImplementation(async () => {
      order.push("link");
    });
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=changes-sent");
    expect(order).toEqual(["round", "link"]);
    expect(linkFeedbackTicket).toHaveBeenCalledWith(tx, { ticketId: "ticket-1", projectId: "project-1", businessId: "business-1", round: 2 });
  });

  it("sends the alerts only after the transaction has committed", async () => {
    let committed = false;
    transaction.mockImplementation(async (work: (t: never) => Promise<unknown>) => {
      const result = await work(tx);
      committed = true;
      return result;
    });
    vi.mocked(sendSupportTicketAlert).mockImplementation(async () => {
      expect(committed).toBe(true);
    });
    vi.mocked(sendPreviewChangesReceived).mockImplementation(async () => {
      expect(committed).toBe(true);
    });
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=changes-sent");
    expect(sendSupportTicketAlert).toHaveBeenCalledTimes(1);
    expect(notifyTeamPreviewResponse).toHaveBeenCalledWith(staffDb, { businessId: "business-1", businessName: "Cafe", response: { kind: "revisions" } });
  });

  it("saves no ticket and sends no alert for the press that loses the race", async () => {
    vi.mocked(requestProjectRevisions).mockRejectedValue(new ProjectNotAwaitingResponseError("business-1"));
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=not-ready");
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
    expect(linkFeedbackTicket).not.toHaveBeenCalled();
    expect(sendSupportTicketAlert).not.toHaveBeenCalled();
    expect(sendPreviewChangesReceived).not.toHaveBeenCalled();
    expect(notifyTeamPreviewResponse).not.toHaveBeenCalled();
  });

  it("sends no alert when the ticket cannot be saved, so the round rolls back", async () => {
    vi.mocked(createSupportTicketWithOutcome).mockRejectedValue(new SupportQueryError("conflict", "key reused"));
    expect(await sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).toMatchObject({ status: "error", message: "Check what you wrote and your screenshots, then try again." });
    expect(sendSupportTicketAlert).not.toHaveBeenCalled();
    expect(notifyTeamPreviewResponse).not.toHaveBeenCalled();
  });

  it("tells the team once, and not again when the same form is sent twice", async () => {
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=changes-sent");
    expect(sendSupportTicketAlert).toHaveBeenCalledTimes(1);
    vi.mocked(createSupportTicketWithOutcome).mockResolvedValue({ ticket: { id: "ticket-1", displayRef: "FY-1" }, created: false } as never);
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=changes-sent");
    expect(sendSupportTicketAlert).toHaveBeenCalledTimes(1);
  });

  it("confirms the changes to the customer once, with the round and the words they wrote, and not again for a repeated form", async () => {
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=changes-sent");
    expect(sendPreviewChangesReceived).toHaveBeenCalledTimes(1);
    expect(sendPreviewChangesReceived).toHaveBeenCalledWith({
      user: expect.objectContaining({ name: "Asha Rao", email: "owner@example.test" }),
      body: FEEDBACK,
      round: 2,
      rounds: 2,
      now: expect.any(Date),
    });
    vi.mocked(createSupportTicketWithOutcome).mockResolvedValue({ ticket: { id: "ticket-1", displayRef: "FY-1" }, created: false } as never);
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=changes-sent");
    expect(sendPreviewChangesReceived).toHaveBeenCalledTimes(1);
  });

  it("sends no confirmation when nothing was saved", async () => {
    await sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form({ body: "Short" }));
    vi.mocked(findLatestProject).mockResolvedValue({ status: "building", revisionRoundsGranted: 0 } as never);
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=not-ready");
    expect(sendPreviewChangesReceived).not.toHaveBeenCalled();
  });

  it("sends nothing and says what was wrong when the box is too short", async () => {
    const state = await sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form({ body: "Short" }));
    expect(state).toMatchObject({ status: "error", field: "body", message: "Tell us what to change, in at least 10 characters." });
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
    expect(requestProjectRevisions).not.toHaveBeenCalled();
  });

  it("goes back with the not-ready notice, and saves no ticket, when no preview is waiting", async () => {
    vi.mocked(findLatestProject).mockResolvedValue({ status: "building", revisionRoundsGranted: 0 } as never);
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=not-ready");
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
  });

  it("goes back with the not-ready notice when the preview was answered between the read and the move", async () => {
    vi.mocked(requestProjectRevisions).mockRejectedValue(new ProjectNotAwaitingResponseError("project-1"));
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=not-ready");
  });

  it("sends nothing and says further changes are quoted first once every included round is used", async () => {
    vi.mocked(findLatestProject).mockResolvedValue({ id: "project-1", status: "preview", revisionRoundsGranted: 2, revisionRoundsIncluded: 2 } as never);
    expect(await sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).toMatchObject({ status: "error", message: "Further changes are quoted first." });
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
    expect(linkFeedbackTicket).not.toHaveBeenCalled();
    expect(requestProjectRevisions).not.toHaveBeenCalled();
  });

  it("sends nothing for a build that includes no rounds", async () => {
    vi.mocked(findLatestProject).mockResolvedValue({ id: "project-1", status: "preview", revisionRoundsGranted: 0, revisionRoundsIncluded: 0 } as never);
    expect(await sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).toMatchObject({ status: "error", message: "Further changes are quoted first." });
    expect(requestProjectRevisions).not.toHaveBeenCalled();
  });

  it("takes feedback again after staff add a round", async () => {
    vi.mocked(findLatestProject).mockResolvedValue({ id: "project-1", status: "preview", revisionRoundsGranted: 2, revisionRoundsIncluded: 3 } as never);
    vi.mocked(requestProjectRevisions).mockResolvedValue({ id: "project-1", revisionRoundsGranted: 3, revisionRoundsIncluded: 3 } as never);
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/website?response=changes-sent");
    expect(linkFeedbackTicket).toHaveBeenCalledWith(tx, expect.objectContaining({ round: 3 }));
  });

  it("answers with the same sentence when the last round was taken between the read and the move", async () => {
    vi.mocked(requestProjectRevisions).mockRejectedValue(new RevisionRoundsUsedUpError("business-1"));
    expect(await sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).toMatchObject({ status: "error", message: "Further changes are quoted first." });
  });

  it("sends a lapsed customer Home before the rounds are looked at", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { id: "user-a", email: "owner@example.test" }, tenant, billing: { status: "lapsed", hasAccess: false } } as never);
    vi.mocked(findLatestProject).mockResolvedValue({ id: "project-1", status: "preview", revisionRoundsGranted: 2, revisionRoundsIncluded: 2 } as never);
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/");
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
    expect(requestProjectRevisions).not.toHaveBeenCalled();
  });

  it("sends a lapsed customer Home and saves no feedback", async () => {
    vi.mocked(requireCustomerAccess).mockResolvedValue({ user: { id: "user-a", email: "owner@example.test" }, tenant, billing: { status: "lapsed", hasAccess: false } } as never);
    await expect(sendPreviewFeedbackAction(INITIAL_SUPPORT_STATE, form())).rejects.toThrow("REDIRECT:/");
    expect(createSupportTicketWithOutcome).not.toHaveBeenCalled();
    expect(requestProjectRevisions).not.toHaveBeenCalled();
  });
});
