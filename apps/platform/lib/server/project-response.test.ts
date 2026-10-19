import { approveProjectPreview, requestProjectRevisions, type Database } from "@brandbasket/db";
import { createAppEmailTransport, previewApprovedEmail, previewRevisionsRequestedEmail } from "@brandbasket/email";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { respondToPreview } from "./project-response";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({ approveProjectPreview: vi.fn(), requestProjectRevisions: vi.fn() }));
vi.mock("@brandbasket/email", () => ({
  createAppEmailTransport: vi.fn(),
  previewApprovedEmail: vi.fn(),
  previewRevisionsRequestedEmail: vi.fn(),
}));
vi.mock("./env", () => ({ serverEnv: () => ({ ADMIN_ORIGIN: "http://admin.localhost:3001" }) }));

const mockedApprove = vi.mocked(approveProjectPreview);
const mockedRequestRevisions = vi.mocked(requestProjectRevisions);
const mockedCreateTransport = vi.mocked(createAppEmailTransport);
const mockedApprovedEmail = vi.mocked(previewApprovedEmail);
const mockedRevisionsEmail = vi.mocked(previewRevisionsRequestedEmail);
const db = {} as Database;
const NOW = new Date("2026-09-18T12:00:00.000Z");
const send = vi.fn();
const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
  vi.resetAllMocks();
  consoleError.mockImplementation(() => undefined);
  process.env.FYNIX_TEAM_EMAIL = "team@example.com";
  mockedApprove.mockResolvedValue({} as Awaited<ReturnType<typeof approveProjectPreview>>);
  mockedRequestRevisions.mockResolvedValue({} as Awaited<ReturnType<typeof requestProjectRevisions>>);
  mockedCreateTransport.mockReturnValue({ send });
  mockedApprovedEmail.mockReturnValue({
    to: "team@example.com",
    subject: "s",
    template: "preview-approved",
    bodyText: "t",
    bodyHtml: "h",
  });
  mockedRevisionsEmail.mockReturnValue({
    to: "team@example.com",
    subject: "s",
    template: "preview-revisions-requested",
    bodyText: "t",
    bodyHtml: "h",
  });
  send.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.FYNIX_TEAM_EMAIL;
});

describe("respondToPreview", () => {
  it("approves and notifies the team", async () => {
    await respondToPreview(db, { businessId: "business-1", businessName: "Riverside Plumbing", response: { kind: "approve" } }, NOW);

    expect(mockedApprove).toHaveBeenCalledWith(db, { businessId: "business-1", now: NOW });
    expect(mockedRequestRevisions).not.toHaveBeenCalled();
    expect(mockedApprovedEmail).toHaveBeenCalledWith({
      to: "team@example.com",
      businessName: "Riverside Plumbing",
      clientUrl: "http://admin.localhost:3001/clients/business-1",
    });
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("requests revisions and notifies the team", async () => {
    await respondToPreview(
      db,
      { businessId: "business-1", businessName: "Riverside Plumbing", response: { kind: "revisions" } },
      NOW,
    );

    expect(mockedRequestRevisions).toHaveBeenCalledWith(db, { businessId: "business-1", now: NOW });
    expect(mockedApprove).not.toHaveBeenCalled();
    expect(mockedRevisionsEmail).toHaveBeenCalledWith({
      to: "team@example.com",
      businessName: "Riverside Plumbing",
      clientUrl: "http://admin.localhost:3001/clients/business-1",
    });
  });

  it("does not send an email when the database write itself fails", async () => {
    const refusal = new Error("Project business-1 is not awaiting a response to a preview.");
    mockedApprove.mockRejectedValue(refusal);

    await expect(
      respondToPreview(db, { businessId: "business-1", businessName: "Riverside Plumbing", response: { kind: "approve" } }, NOW),
    ).rejects.toBe(refusal);
    expect(send).not.toHaveBeenCalled();
  });

  it("does not fail the customer's action when the team notification fails", async () => {
    send.mockRejectedValue(new Error("outbox is down"));

    await expect(
      respondToPreview(db, { businessId: "business-1", businessName: "Riverside Plumbing", response: { kind: "approve" } }, NOW),
    ).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });

  it("logs and skips the email rather than throwing when no team inbox is configured", async () => {
    delete process.env.FYNIX_TEAM_EMAIL;

    await expect(
      respondToPreview(db, { businessId: "business-1", businessName: "Riverside Plumbing", response: { kind: "approve" } }, NOW),
    ).resolves.toBeUndefined();
    expect(send).not.toHaveBeenCalled();
    expect(consoleError).toHaveBeenCalled();
  });
});
