import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@brandbasket/db";
import type { EmailMessage } from "./message";

vi.mock("@brandbasket/db", () => ({ recordEmail: vi.fn(async () => undefined) }));

const { recordEmail } = await import("@brandbasket/db");
const { createOutboxTransport } = await import("./outbox");

const db = {} as Database;

function message(linkWithheld: boolean): EmailMessage {
  return {
    to: "asha@example.in",
    subject: "Reset your Brandbasket password",
    template: "password-reset",
    bodyText: "full body with https://app.brandbasket.in/reset-password/TOKEN",
    bodyHtml: "<p>full</p>",
    outboxCopy: {
      subject: "Reset your Brandbasket password",
      bodyText: "copy without the link",
      bodyHtml: "<p>copy</p>",
      ...(linkWithheld ? { linkWithheld: true as const } : {}),
    },
  };
}

beforeEach(() => vi.mocked(recordEmail).mockClear());

describe("createOutboxTransport", () => {
  it("stores the copy by default", async () => {
    await createOutboxTransport(db).send(message(true));
    expect(recordEmail).toHaveBeenCalledWith(db, expect.objectContaining({ bodyText: "copy without the link", transport: "outbox" }));
  });

  it("stores the full message for a withheld link in the local development inbox", async () => {
    await createOutboxTransport(db, { keepLinksForLocalDevelopment: true }).send(message(true));
    expect(recordEmail).toHaveBeenCalledWith(db, expect.objectContaining({ bodyText: expect.stringContaining("TOKEN") }));
  });

  it("still stores the copy for other redactions, such as customer text in support alerts", async () => {
    await createOutboxTransport(db, { keepLinksForLocalDevelopment: true }).send(message(false));
    expect(recordEmail).toHaveBeenCalledWith(db, expect.objectContaining({ bodyText: "copy without the link" }));
  });
});

describe("createOutboxTransport with attachments", () => {
  const plain: EmailMessage = { to: "asha@example.in", subject: "Receipt", template: "payment-received", bodyText: "thanks", bodyHtml: "<p>thanks</p>" };
  const bytes = new TextEncoder().encode("%PDF-1.4 test");

  it("lists the file names in the stored copy and holds no bytes", async () => {
    await createOutboxTransport(db).send({
      ...plain,
      attachments: [
        { name: "invoice.pdf", content: bytes },
        { name: "terms<1>.pdf", content: bytes },
      ],
    });
    const stored = vi.mocked(recordEmail).mock.calls[0]?.[1];
    expect(stored?.bodyText).toBe("thanks\nAttachments: invoice.pdf, terms<1>.pdf");
    expect(stored?.bodyHtml).toBe("<p>thanks</p>\n<p>Attachments: invoice.pdf, terms&lt;1&gt;.pdf</p>");
    expect(JSON.stringify(stored)).not.toContain("PDF-1.4");
    expect(stored?.bodyRedacted).toBe(false);
  });

  it("adds the line to a redacted copy too", async () => {
    await createOutboxTransport(db).send({ ...message(true), attachments: [{ name: "a.pdf", content: bytes }] });
    const stored = vi.mocked(recordEmail).mock.calls[0]?.[1];
    expect(stored?.bodyText).toBe("copy without the link\nAttachments: a.pdf");
    expect(stored?.bodyRedacted).toBe(true);
  });

  it("stores a message without attachments exactly as before", async () => {
    await createOutboxTransport(db).send(plain);
    expect(vi.mocked(recordEmail).mock.calls[0]?.[1]).toMatchObject({ bodyText: "thanks", bodyHtml: "<p>thanks</p>", bodyRedacted: false });
    vi.mocked(recordEmail).mockClear();
    await createOutboxTransport(db).send({ ...plain, attachments: [] });
    expect(vi.mocked(recordEmail).mock.calls[0]?.[1]).toMatchObject({ bodyText: "thanks", bodyHtml: "<p>thanks</p>" });
  });
});
