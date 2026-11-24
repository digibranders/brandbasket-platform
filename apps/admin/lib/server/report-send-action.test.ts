import { ReportMoveError } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createReportSend, type SendOutcome } from "./report-send-action";

vi.mock("server-only", () => ({}));

const REPORT = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const SENT = { businessId: "b-1", month: "2026-10-01", service: "website" };

function setup(send: () => Promise<{ report: typeof SENT; email: SendOutcome }>) {
  const log = vi.fn().mockResolvedValue(undefined);
  const record = vi.fn().mockResolvedValue(undefined);
  const revalidate = vi.fn();
  const sendReport = createReportSend({ requireStaff: async () => ({ user: { id: "staff-1" } }), send, log, record, revalidate });
  return { sendReport, log, record, revalidate };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("send from the list", () => {
  it("says the owner was emailed, logs it and records it", async () => {
    const { sendReport, log, record, revalidate } = setup(async () => ({ report: SENT, email: "sent" }));
    expect(await sendReport(REPORT)).toEqual({ ok: true, notice: { tone: "ok", text: "The report is sent. The owner has been emailed." } });
    expect(log).toHaveBeenCalledWith({ user: { id: "staff-1" } }, REPORT, "ok");
    expect(record).toHaveBeenCalledWith({ user: { id: "staff-1" } }, { businessId: "b-1", kind: "report.send", summary: "Sent the 2026-10 website report" });
    expect(revalidate).toHaveBeenCalled();
  });

  it.each([
    ["owner-turned-off", "The owner has turned off report emails, so none was sent."],
    ["no-address", "The owner has no email address, so none was sent."],
    ["already-sent", "The owner had already been emailed about this report."],
  ] as const)("does not claim an email for %s", async (email, words) => {
    const result = await setup(async () => ({ report: SENT, email })).sendReport(REPORT);
    expect(result.ok).toBe(true);
    expect(result.notice.text).toContain(words);
    expect(result.notice.text).not.toContain("has been emailed.");
  });

  it("is a problem, which the list answers with Retry, when the report is sent but the email did not go", async () => {
    const result = await setup(async () => ({ report: SENT, email: "failed" })).sendReport(REPORT);
    expect(result.ok).toBe(false);
    expect(result.notice.tone).toBe("problem");
  });

  it("does not turn a bookkeeping failure into a failed send", async () => {
    const { sendReport, log } = setup(async () => ({ report: SENT, email: "sent" }));
    log.mockRejectedValue(new Error("log down"));
    expect((await sendReport(REPORT)).ok).toBe(true);
  });

  it("words a refused move, and a send that threw, and logs the failure", async () => {
    const refused = setup(async () => {
      throw new ReportMoveError("changed", "changed");
    });
    expect(await refused.sendReport(REPORT)).toMatchObject({ ok: false, notice: { text: expect.stringContaining("Someone else changed this report") } });
    const broken = setup(async () => {
      throw new Error("storage down");
    });
    expect(await broken.sendReport(REPORT)).toMatchObject({ ok: false, notice: { text: expect.stringContaining("could not be sent") } });
    expect(broken.log).toHaveBeenCalledWith({ user: { id: "staff-1" } }, REPORT, "failed");
  });

  it("refuses an id that is not one without sending", async () => {
    const send = vi.fn();
    expect((await setup(send).sendReport("nope")).ok).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });
});
