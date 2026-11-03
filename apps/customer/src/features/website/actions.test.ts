import { ProjectNotAwaitingResponseError, RevisionRoundsUsedUpError, SupportQueryError } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { requireWebsite } from "@/lib/guards";
import { reportError } from "@/lib/report";
import { notifyTeamPreviewResponse, sendFeedbackTicketAlert, sendPreviewChangesReceived } from "./alerts";
import { approvePreviewAction, sendPreviewFeedbackAction } from "./actions";
import { VIEWER_MESSAGE } from "./rules/notices";
import { ROUNDS_USED_UP } from "./rules/progress";

/*
 * The preview actions against an in-memory stand-in for the two tables they move: the project (status and rounds) and the
 * feedback tickets. A staff transaction stages its writes and applies them only when its work resolves, one transaction at
 * a time, which is what the project row lock taken by requestProjectRevisions does in Postgres.
 */

const BUSINESS_ID = "0192f3c4-1111-7000-8000-000000000001";
const PROJECT_ID = "0192f3c4-2222-7000-8000-000000000002";
const KEY = "feedback-key-12345678";
const BODY = "Make the logo bigger on every page.";

class Redirected extends Error {
  constructor(readonly url: string) {
    super(`redirect ${url}`);
  }
}

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Redirected(url);
  },
}));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requireWebsite: vi.fn() }));
vi.mock("@/lib/report", () => ({ reportError: vi.fn() }));
vi.mock("./alerts", () => ({ notifyTeamPreviewResponse: vi.fn(), sendFeedbackTicketAlert: vi.fn(), sendPreviewChangesReceived: vi.fn() }));

interface ProjectRow {
  status: "preview" | "revisions" | "approved";
  revisionRoundsIncluded: number;
  revisionRoundsGranted: number;
}
interface Staged {
  project?: ProjectRow;
  tickets: { id: string; key: string }[];
  links: string[];
}

let project: ProjectRow;
let tickets: { id: string; key: string }[];
let links: string[];
let ticketFailure: Error | null;
let queue: Promise<unknown>;

const projectRow = () => ({ id: PROJECT_ID, previewUrl: "https://preview.test", ...project });

vi.mock("@/lib/db", () => ({
  getAppDb: () => ({}),
  getStaffDb: () => ({
    transaction: (work: (tx: Staged) => Promise<unknown>) => {
      // One at a time, like two sends waiting on the same project row.
      const run = queue.then(async () => {
        const staged: Staged = { tickets: [], links: [] };
        const result = await work(staged);
        if (staged.project !== undefined) project = staged.project;
        tickets.push(...staged.tickets);
        links.push(...staged.links);
        return result;
      });
      queue = run.catch(() => undefined);
      return run;
    },
  }),
}));

vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  withTenantScope: async (_db: unknown, _tenant: unknown, work: (tx: unknown) => Promise<unknown>) => work({}),
  withCustomerRole: async (tx: unknown, _scope: unknown, work: (tx: unknown) => Promise<unknown>) => work(tx),
  findLatestProject: async () => projectRow(),
  consumeRateLimit: vi.fn(async () => ({ allowed: true, retryAfterSeconds: 0 })),
  approveProjectPreview: vi.fn(async () => {
    const { ProjectNotAwaitingResponseError: NotAwaiting } = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
    if (project.status !== "preview") throw new NotAwaiting(BUSINESS_ID);
    project = { ...project, status: "approved" };
    return projectRow();
  }),
  requestProjectRevisions: vi.fn(async (tx: Staged) => {
    const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
    if (project.status !== "preview") throw new actual.ProjectNotAwaitingResponseError(BUSINESS_ID);
    if (project.revisionRoundsGranted >= project.revisionRoundsIncluded) throw new actual.RevisionRoundsUsedUpError(BUSINESS_ID);
    tx.project = { ...project, status: "revisions", revisionRoundsGranted: project.revisionRoundsGranted + 1 };
    return { id: PROJECT_ID, ...tx.project };
  }),
  createSupportTicketWithOutcome: vi.fn(async (tx: Staged, input: { submissionKey: string }) => {
    if (ticketFailure !== null) throw ticketFailure;
    const existing = tickets.find((ticket) => ticket.key === input.submissionKey);
    if (existing !== undefined) return { ticket: { id: existing.id, displayRef: "REF" }, created: false };
    const ticket = { id: `ticket-${tickets.length + tx.tickets.length + 1}`, key: input.submissionKey };
    tx.tickets.push(ticket);
    return { ticket: { id: ticket.id, displayRef: "REF" }, created: true };
  }),
  linkFeedbackTicket: vi.fn(async (tx: Staged, input: { ticketId: string }) => {
    tx.links.push(input.ticketId);
  }),
}));

function context(role: "owner" | "editor" | "viewer" = "owner") {
  return {
    user: { id: "user-1", email: "owner@example.com", name: "Asha", phone: null, emailConfirmed: true },
    tenant: { userId: "user-1", businessId: BUSINESS_ID, businessName: "Apex", role },
    businessId: BUSINESS_ID,
    businessName: "Apex",
    role,
    billing: { status: "paid", hasAccess: true, hasWebsite: true },
    services: ["website"],
    currency: "INR",
  };
}

function feedback(body = BODY, key = KEY): FormData {
  const form = new FormData();
  form.set("body", body);
  form.set("submissionKey", key);
  return form;
}

async function redirectOf(run: Promise<unknown>): Promise<string> {
  try {
    await run;
  } catch (error) {
    if (error instanceof Redirected) return error.url;
    throw error;
  }
  throw new Error("Expected a redirect");
}

beforeEach(() => {
  vi.clearAllMocks();
  project = { status: "preview", revisionRoundsIncluded: 2, revisionRoundsGranted: 0 };
  tickets = [];
  links = [];
  ticketFailure = null;
  queue = Promise.resolve();
  vi.mocked(requireWebsite).mockResolvedValue(context() as never);
  delete process.env.BRANDBASKET_SUPPORT_MODE;
});

describe("approvePreviewAction", () => {
  it("approves the waiting preview, tells the team and says thanks", async () => {
    expect(await redirectOf(approvePreviewAction())).toBe("/website?response=approved");
    expect(project.status).toBe("approved");
    expect(notifyTeamPreviewResponse).toHaveBeenCalledWith("approve", { id: BUSINESS_ID, name: "Apex" });
    expect(requireWebsite).toHaveBeenCalledWith({ write: true });
  });

  it("says there is no preview waiting on a second press", async () => {
    project = { ...project, status: "approved" };
    expect(await redirectOf(approvePreviewAction())).toBe("/website?response=not-ready");
    expect(notifyTeamPreviewResponse).not.toHaveBeenCalled();
  });

  it("refuses a viewer, because the move runs on the staff connection", async () => {
    vi.mocked(requireWebsite).mockResolvedValue(context("viewer") as never);
    expect(await approvePreviewAction()).toEqual({ ok: false, message: VIEWER_MESSAGE });
    expect(project.status).toBe("preview");
  });
});

describe("sendPreviewFeedbackAction", () => {
  it("counts the round, saves and links the ticket, then alerts once", async () => {
    expect(await redirectOf(sendPreviewFeedbackAction(null, feedback()))).toBe("/website?response=changes-sent");
    expect(project).toMatchObject({ status: "revisions", revisionRoundsGranted: 1 });
    expect(tickets).toHaveLength(1);
    expect(links).toEqual(["ticket-1"]);
    expect(sendFeedbackTicketAlert).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendFeedbackTicketAlert).mock.calls[0]?.[0]).toMatchObject({ subject: "Preview feedback, round 1: Make the logo bigger on every page" });
    expect(sendPreviewChangesReceived).toHaveBeenCalledWith(expect.objectContaining({ round: 1, rounds: 2 }));
    expect(notifyTeamPreviewResponse).toHaveBeenCalledWith("revisions", { id: BUSINESS_ID, name: "Apex" });
  });

  it("leaves no orphan ticket and sends no alert for the loser of two racing sends", async () => {
    const results = await Promise.allSettled([sendPreviewFeedbackAction(null, feedback(BODY, "first-key-1234")), sendPreviewFeedbackAction(null, feedback("Change the photo on the about page.", "second-key-123"))]);
    const urls = results.map((result) => (result.status === "rejected" && result.reason instanceof Redirected ? result.reason.url : "none"));
    expect(urls.sort()).toEqual(["/website?response=changes-sent", "/website?response=not-ready"]);
    expect(tickets).toHaveLength(1);
    expect(links).toHaveLength(1);
    expect(project.revisionRoundsGranted).toBe(1);
    expect(sendFeedbackTicketAlert).toHaveBeenCalledTimes(1);
    expect(sendPreviewChangesReceived).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when the last round is taken inside the transaction", async () => {
    vi.mocked((await import("@brandbasket/db")).requestProjectRevisions).mockRejectedValueOnce(new RevisionRoundsUsedUpError(BUSINESS_ID));
    expect(await sendPreviewFeedbackAction(null, feedback())).toEqual({ ok: false, message: ROUNDS_USED_UP });
    expect(tickets).toHaveLength(0);
    expect(sendFeedbackTicketAlert).not.toHaveBeenCalled();
  });

  it("rolls the round back when the ticket cannot be saved", async () => {
    ticketFailure = new SupportQueryError("conflict", "This submission key was already used for different feedback.");
    expect(await sendPreviewFeedbackAction(null, feedback())).toEqual({ ok: false, message: "Check what you wrote and your screenshots, then try again." });
    expect(project).toMatchObject({ status: "preview", revisionRoundsGranted: 0 });
    expect(links).toHaveLength(0);
  });

  it("reports an unexpected failure and keeps what was written", async () => {
    ticketFailure = new Error("connection lost");
    expect(await sendPreviewFeedbackAction(null, feedback())).toEqual({ ok: false, message: "Your changes could not be sent. What you wrote is still here; try again." });
    expect(reportError).toHaveBeenCalledWith(ticketFailure, { area: "website.feedback" });
    expect(project.status).toBe("preview");
  });

  it("refuses once the included rounds are used, before writing anything", async () => {
    project = { ...project, revisionRoundsGranted: 2 };
    expect(await sendPreviewFeedbackAction(null, feedback())).toEqual({ ok: false, message: ROUNDS_USED_UP });
    expect((await import("@brandbasket/db")).requestProjectRevisions).not.toHaveBeenCalled();
  });

  it("says there is no preview waiting when the project has moved on", async () => {
    project = { ...project, status: "revisions" };
    expect(await redirectOf(sendPreviewFeedbackAction(null, feedback()))).toBe("/website?response=not-ready");
  });

  it("points at the box for feedback that is too short", async () => {
    expect(await sendPreviewFeedbackAction(null, feedback("Short"))).toEqual({
      ok: false,
      message: "Tell us what to change, in at least 10 characters.",
      fieldErrors: { body: "Tell us what to change, in at least 10 characters." },
    });
  });

  it("refuses a viewer and honours the support switch and the rate limit", async () => {
    vi.mocked(requireWebsite).mockResolvedValueOnce(context("viewer") as never);
    expect(await sendPreviewFeedbackAction(null, feedback())).toEqual({ ok: false, message: VIEWER_MESSAGE });

    process.env.BRANDBASKET_SUPPORT_MODE = "off";
    expect(await sendPreviewFeedbackAction(null, feedback())).toEqual({ ok: false, message: "New requests are temporarily unavailable. Please try again later." });
    delete process.env.BRANDBASKET_SUPPORT_MODE;

    vi.mocked((await import("@brandbasket/db")).consumeRateLimit).mockResolvedValueOnce({ allowed: false, retryAfterSeconds: 42 } as never);
    expect(await sendPreviewFeedbackAction(null, feedback())).toEqual({ ok: false, message: "Please wait 42 seconds before sending another request." });
    expect(tickets).toHaveLength(0);
  });

  it("maps a preview that stopped waiting inside the transaction to the not-ready notice", async () => {
    vi.mocked((await import("@brandbasket/db")).requestProjectRevisions).mockRejectedValueOnce(new ProjectNotAwaitingResponseError(BUSINESS_ID));
    expect(await redirectOf(sendPreviewFeedbackAction(null, feedback()))).toBe("/website?response=not-ready");
    expect(tickets).toHaveLength(0);
  });
});
