import { findClientDetail, recordPreviewVersion, recordProjectPreviewSent, savePreviewImage, type Database } from "@brandbasket/db";
import { previewReadyEmail } from "@brandbasket/email";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { customerEmailTransport } from "./email";
import { captureScreenshot } from "./preview-screenshot";
import { ProjectPreviewRecipientMissingError, resendPreviewEmail, sendProjectPreview, takePreviewPicture } from "./project-preview";
import { addWorkingActivity } from "./website-moves";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({
  findClientDetail: vi.fn(),
  recordPreviewVersion: vi.fn(),
  recordProjectPreviewSent: vi.fn(),
  savePreviewImage: vi.fn(),
}));
vi.mock("./preview-screenshot", () => ({ captureScreenshot: vi.fn() }));
vi.mock("./website-moves", () => ({ addWorkingActivity: vi.fn() }));
vi.mock("@brandbasket/email", () => ({ previewReadyEmail: vi.fn() }));
vi.mock("./email", () => ({ customerEmailTransport: vi.fn() }));

const mockedRecordSent = vi.mocked(recordProjectPreviewSent);
const mockedRecordVersion = vi.mocked(recordPreviewVersion);
const mockedFindClient = vi.mocked(findClientDetail);
const mockedCreateTransport = vi.mocked(customerEmailTransport);
const mockedPreviewReadyEmail = vi.mocked(previewReadyEmail);
const mockedCapture = vi.mocked(captureScreenshot);
const mockedSaveImage = vi.mocked(savePreviewImage);
const mockedActivity = vi.mocked(addWorkingActivity);
const db = {} as Database;
const INPUT = { businessId: "business-1", previewUrl: "https://preview.example", staffId: "staff-1" };
const IMAGE = { image: Buffer.from("webp"), width: 1280, height: 800 };
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
  mockedRecordSent.mockResolvedValue({ id: "project-1" } as Awaited<ReturnType<typeof recordProjectPreviewSent>>);
  mockedRecordVersion.mockResolvedValue(1);
  mockedCapture.mockResolvedValue(IMAGE);
  mockedSaveImage.mockResolvedValue(undefined);
  mockedActivity.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  mockedFindClient.mockResolvedValue(clientWithOwner());
  mockedCreateTransport.mockReturnValue({ send });
  mockedPreviewReadyEmail.mockReturnValue({
    to: "riley@example.com",
    subject: "Your Brandbasket preview is ready",
    template: "preview-ready",
    bodyText: "text",
    bodyHtml: "html",
  });
  send.mockResolvedValue(undefined);
});

describe("sendProjectPreview", () => {
  it("reads the client, records the preview against the business's project, then emails the owner", async () => {
    await sendProjectPreview(db, INPUT, NOW);

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
    expect(mockedFindClient.mock.invocationCallOrder[0]).toBeLessThan(mockedRecordSent.mock.invocationCallOrder[0] ?? 0);
  });

  it("says the owner was emailed", async () => {
    await expect(sendProjectPreview(db, INPUT, NOW)).resolves.toBe("emailed");
  });

  it("records the preview and emails nobody when the owner signs in with a mobile number, and says so", async () => {
    mockedFindClient.mockResolvedValue(clientWithOwner({ ownerEmail: null }));

    await expect(sendProjectPreview(db, INPUT, NOW)).resolves.toBe("no-email");
    expect(mockedRecordSent).toHaveBeenCalledTimes(1);
    expect(mockedPreviewReadyEmail).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not email the owner when recording the preview fails", async () => {
    const refusal = new Error("Business business-1 has no project ready for a preview to be sent.");
    mockedRecordSent.mockRejectedValue(refusal);

    await expect(
      sendProjectPreview(db, INPUT, NOW),
    ).rejects.toBe(refusal);
    expect(mockedActivity).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("throws and records nothing when the business has no owner", async () => {
    mockedFindClient.mockResolvedValue({ businessId: "business-1", owner: null } as Awaited<
      ReturnType<typeof findClientDetail>
    >);

    await expect(
      sendProjectPreview(db, INPUT, NOW),
    ).rejects.toThrow(ProjectPreviewRecipientMissingError);
    expect(mockedRecordSent).not.toHaveBeenCalled();
    expect(mockedActivity).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("takes and stores a picture of the link, and writes the dated line, before emailing", async () => {
    await sendProjectPreview(db, INPUT, NOW);

    expect(mockedCapture).toHaveBeenCalledWith("https://preview.example");
    expect(mockedSaveImage).toHaveBeenCalledWith(db, { projectId: "project-1", businessId: "business-1", previewUrl: "https://preview.example", ...IMAGE });
    expect(mockedActivity).toHaveBeenCalledWith(db, { businessId: "business-1", staffId: "staff-1", title: "Your website preview is ready to check", now: NOW });
    expect(mockedSaveImage.mock.invocationCallOrder[0]).toBeLessThan(send.mock.invocationCallOrder[0] ?? 0);
  });

  it("still records the preview, writes the line and emails the owner when the picture cannot be taken", async () => {
    mockedCapture.mockRejectedValue(new Error("provider down"));

    await expect(sendProjectPreview(db, INPUT, NOW)).resolves.toBe("emailed");
    expect(mockedSaveImage).not.toHaveBeenCalled();
    expect(console.error).toHaveBeenCalledWith("[preview-picture]", expect.anything());
    expect(mockedActivity).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("still emails the owner when the picture cannot be stored", async () => {
    mockedSaveImage.mockRejectedValue(new Error("image over 1 MB"));

    await expect(sendProjectPreview(db, INPUT, NOW)).resolves.toBe("emailed");
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("writes no line when the preview could not be recorded", async () => {
    mockedRecordSent.mockRejectedValue(new Error("not ready"));
    await expect(sendProjectPreview(db, INPUT, NOW)).rejects.toThrow("not ready");
    expect(mockedCapture).not.toHaveBeenCalled();
    expect(mockedActivity).not.toHaveBeenCalled();
  });
});

describe("sendProjectPreview outcomes beyond the happy path", () => {
  it("records the preview version with the sent link, time and staff member", async () => {
    await sendProjectPreview(db, INPUT, NOW);

    expect(mockedRecordVersion).toHaveBeenCalledWith(db, {
      projectId: "project-1",
      businessId: "business-1",
      previewUrl: "https://preview.example",
      sentAt: NOW,
      staffId: "staff-1",
    });
  });

  it("still records the preview and emails the owner when the version cannot be recorded", async () => {
    mockedRecordVersion.mockRejectedValue(new Error("unique violation"));

    await expect(sendProjectPreview(db, INPUT, NOW)).resolves.toBe("emailed");
    expect(console.error).toHaveBeenCalledWith("[preview-version]", expect.anything());
    expect(send).toHaveBeenCalledTimes(1);
  });

  it("keeps the saved preview and reports email-failed when the send fails", async () => {
    send.mockRejectedValue(new Error("brevo down"));

    await expect(sendProjectPreview(db, INPUT, NOW)).resolves.toBe("email-failed");
    expect(mockedRecordSent).toHaveBeenCalledTimes(1);
    expect(mockedActivity).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("[preview-email]", expect.objectContaining({ businessId: "business-1" }));
  });
});

describe("resendPreviewEmail", () => {
  function clientWithPreview(overrides: {
    readonly status?: string;
    readonly previewUrl?: string | null;
    readonly owner?: boolean;
    readonly ownerEmail?: string | null;
  } = {}) {
    return {
      businessId: "business-1",
      businessName: "Riverside Plumbing",
      owner:
        (overrides.owner ?? true)
          ? { name: "Riley Owner", email: overrides.ownerEmail === undefined ? "riley@example.com" : overrides.ownerEmail, phone: null }
          : null,
      project: {
        id: "project-1",
        status: overrides.status ?? "preview",
        previewUrl: overrides.previewUrl === undefined ? "https://preview.example" : overrides.previewUrl,
      },
    } as unknown as Awaited<ReturnType<typeof findClientDetail>>;
  }

  beforeEach(() => {
    mockedFindClient.mockResolvedValue(clientWithPreview());
  });

  it("emails the stored preview link and changes nothing on the project", async () => {
    await expect(resendPreviewEmail(db, { businessId: "business-1" })).resolves.toBe("emailed");
    expect(mockedPreviewReadyEmail).toHaveBeenCalledWith({
      to: "riley@example.com",
      businessName: "Riverside Plumbing",
      previewUrl: "https://preview.example",
    });
    expect(mockedRecordSent).not.toHaveBeenCalled();
    expect(mockedRecordVersion).not.toHaveBeenCalled();
    expect(mockedActivity).not.toHaveBeenCalled();
  });

  it("is not allowed once the preview is no longer waiting for the customer", async () => {
    mockedFindClient.mockResolvedValue(clientWithPreview({ status: "approved" }));

    await expect(resendPreviewEmail(db, { businessId: "business-1" })).resolves.toBe("not-allowed");
    expect(send).not.toHaveBeenCalled();
  });

  it("is not allowed without a stored link or an owner", async () => {
    mockedFindClient.mockResolvedValue(clientWithPreview({ previewUrl: null }));
    await expect(resendPreviewEmail(db, { businessId: "business-1" })).resolves.toBe("not-allowed");

    mockedFindClient.mockResolvedValue(clientWithPreview({ owner: false }));
    await expect(resendPreviewEmail(db, { businessId: "business-1" })).resolves.toBe("not-allowed");
    expect(send).not.toHaveBeenCalled();
  });

  it("says no email was sent when the owner signs in with a mobile number", async () => {
    mockedFindClient.mockResolvedValue(clientWithPreview({ ownerEmail: null }));

    await expect(resendPreviewEmail(db, { businessId: "business-1" })).resolves.toBe("no-email");
    expect(send).not.toHaveBeenCalled();
  });

  it("reports email-failed when the send fails, and never throws", async () => {
    send.mockRejectedValue(new Error("brevo down"));

    await expect(resendPreviewEmail(db, { businessId: "business-1" })).resolves.toBe("email-failed");
    expect(console.error).toHaveBeenCalledWith("[preview-email]", expect.anything());
  });
});

describe("takePreviewPicture", () => {
  const picture = { projectId: "project-1", businessId: "business-1", previewUrl: "https://preview.example" };

  it("says it took the picture", async () => {
    await expect(takePreviewPicture(db, picture)).resolves.toBe(true);
  });

  it("says it did not, and never throws, when the capture fails", async () => {
    mockedCapture.mockRejectedValue(new Error("provider down"));
    await expect(takePreviewPicture(db, picture)).resolves.toBe(false);
  });
});
