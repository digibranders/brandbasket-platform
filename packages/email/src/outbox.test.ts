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
