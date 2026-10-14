import { describe, expect, it, vi } from "vitest";
import { insertSmsMessage } from "@firstfold/db";
import { createOutboxSender } from "./outbox-sender";

vi.mock("server-only", () => ({}));
vi.mock("@firstfold/db", () => ({ insertSmsMessage: vi.fn() }));

const mockedInsertSmsMessage = vi.mocked(insertSmsMessage);

describe("createOutboxSender", () => {
  it("inserts the message into the sms_messages outbox with the given db", async () => {
    const db = {} as never;
    const sender = createOutboxSender(db);

    await sender.send({ to: "+919876543210", body: "482913 is your code...", businessId: "biz-1" });

    expect(mockedInsertSmsMessage).toHaveBeenCalledTimes(1);
    expect(mockedInsertSmsMessage).toHaveBeenCalledWith(db, {
      businessId: "biz-1",
      toPhone: "+919876543210",
      body: "482913 is your code...",
    });
  });
});
