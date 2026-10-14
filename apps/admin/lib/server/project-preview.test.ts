import { findClientDetail, recordProjectPreviewSent, type Database } from "@fynix/db";
import { previewReadyEmail } from "@fynix/email";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { customerEmailTransport } from "./email";
import { ProjectPreviewRecipientMissingError, sendProjectPreview } from "./project-preview";

vi.mock("server-only", () => ({}));
vi.mock("@fynix/db", () => ({ findClientDetail: vi.fn(), recordProjectPreviewSent: vi.fn() }));
vi.mock("@fynix/email", () => ({ previewReadyEmail: vi.fn() }));
vi.mock("./email", () => ({ customerEmailTransport: vi.fn() }));

const mockedRecordSent = vi.mocked(recordProjectPreviewSent);
const mockedFindClient = vi.mocked(findClientDetail);
const mockedCreateTransport = vi.mocked(customerEmailTransport);
const mockedPreviewReadyEmail = vi.mocked(previewReadyEmail);
const db = {} as Database;
const NOW = new Date("2026-09-18T12:00:00.000Z");
const send = vi.fn();

function clientWithOwner(overrides: { readonly businessName?: string; readonly ownerEmail?: string | null } = {}) {
  return {
    businessId: "business-1",
    businessName: overrides.businessName ?? "Riverside Plumbing",
    owner: { name: "Riley Owner", email: overrides.ownerEmail === undefined ? "riley@example.com" : overrides.ownerEmail, phone: null },
  } as Awaited<ReturnType<typeof findClientDetail>>;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedRecordSent.mockResolvedValue({} as Awaited<ReturnType<typeof recordProjectPreviewSent>>);
  mockedFindClient.mockResolvedValue(clientWithOwner());
  mockedCreateTransport.mockReturnValue({ send });
  mockedPreviewReadyEmail.mockReturnValue({
    to: "riley@example.com",
    subject: "Your Fynix preview is ready",
    template: "preview-ready",
    bodyText: "text",
    bodyHtml: "html",
  });
  send.mockResolvedValue(undefined);
});

describe("sendProjectPreview", () => {
  it("records the preview against the business's project before emailing the owner", async () => {
    await sendProjectPreview(db, { businessId: "business-1", previewUrl: "https://preview.example" }, NOW);

    expect(mockedRecordSent).toHaveBeenCalledWith(db, {
      businessId: "business-1",
      previewUrl: "https://preview.example",
      now: NOW,
    });
    expect(mockedPreviewReadyEmail).toHaveBeenCalledWith({
      to: "riley@example.com",
      businessName: "Riverside Plumbing",
      previewUrl: "https://preview.example",
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(mockedRecordSent.mock.invocationCallOrder[0]).toBeLessThan(mockedFindClient.mock.invocationCallOrder[0] ?? 0);
  });

  it("says the owner was emailed", async () => {
    await expect(sendProjectPreview(db, { businessId: "business-1", previewUrl: "https://preview.example" }, NOW)).resolves.toBe("emailed");
  });

  it("records the preview and emails nobody when the owner signs in with a mobile number, and says so", async () => {
    mockedFindClient.mockResolvedValue(clientWithOwner({ ownerEmail: null }));

    await expect(sendProjectPreview(db, { businessId: "business-1", previewUrl: "https://preview.example" }, NOW)).resolves.toBe("no-email");
    expect(mockedRecordSent).toHaveBeenCalledTimes(1);
    expect(mockedPreviewReadyEmail).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not look up the client or send an email when recording the preview fails", async () => {
    const refusal = new Error("Business business-1 has no project ready for a preview to be sent.");
    mockedRecordSent.mockRejectedValue(refusal);

    await expect(
      sendProjectPreview(db, { businessId: "business-1", previewUrl: "https://preview.example" }, NOW),
    ).rejects.toBe(refusal);
    expect(mockedFindClient).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("throws rather than silently skipping the email when the business has no owner", async () => {
    mockedFindClient.mockResolvedValue({ businessId: "business-1", owner: null } as Awaited<
      ReturnType<typeof findClientDetail>
    >);

    await expect(
      sendProjectPreview(db, { businessId: "business-1", previewUrl: "https://preview.example" }, NOW),
    ).rejects.toThrow(ProjectPreviewRecipientMissingError);
    expect(send).not.toHaveBeenCalled();
  });
});
