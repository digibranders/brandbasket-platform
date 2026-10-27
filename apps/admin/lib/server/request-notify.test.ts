import { findRequestRecipient } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { customerEmailTransport } from "./email";
import { notifyRequester } from "./request-notify";

vi.mock("server-only", () => ({}));
vi.mock("./email", () => ({ customerEmailTransport: vi.fn() }));
vi.mock("./env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.brandbasket.in" }) }));
vi.mock("@brandbasket/db", async (importOriginal) => ({ ...(await importOriginal<typeof import("@brandbasket/db")>()), findRequestRecipient: vi.fn() }));

const DB = { kind: "staff-db" } as never;
const TICKET = "0192f3c4-0000-7000-8000-000000000002";
const RECIPIENT = { ticketId: TICKET, subject: "Add an Implants page", name: "Priya Shah", email: "priya@example.com", businessName: "Sai Dental Care", isChange: true };
const send = vi.fn();

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(findRequestRecipient).mockResolvedValue(RECIPIENT);
  vi.mocked(customerEmailTransport).mockReturnValue({ send });
  send.mockResolvedValue(undefined);
});

describe("notifyRequester", () => {
  it("emails the person who asked, with a link that opens their request in the dashboard", async () => {
    expect(await notifyRequester(DB, TICKET, { kind: "ready" })).toBe("emailed");
    expect(customerEmailTransport).toHaveBeenCalledWith(DB);
    const message = send.mock.calls[0]?.[0];
    expect(message).toMatchObject({ to: "priya@example.com", subject: "Ready to check: Add an Implants page", template: "change-request-ready" });
    expect(message.bodyText).toContain(`https://app.brandbasket.in/requests?open=${TICKET}`);
  });

  it("says there is nobody to email for a phone account, and sends nothing", async () => {
    vi.mocked(findRequestRecipient).mockResolvedValue({ ...RECIPIENT, email: null });
    expect(await notifyRequester(DB, TICKET, { kind: "done" })).toBe("no-email");
    expect(send).not.toHaveBeenCalled();
  });

  it("reports a failed send, and a ticket it cannot find, without throwing", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    send.mockRejectedValue(new Error("brevo down"));
    expect(await notifyRequester(DB, TICKET, { kind: "done" })).toBe("failed");
    expect(log).toHaveBeenCalledTimes(1);
    vi.mocked(findRequestRecipient).mockResolvedValue(null);
    expect(await notifyRequester(DB, TICKET, { kind: "done" })).toBe("failed");
    log.mockRestore();
  });

  it("reports a missing mail setup the same way", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => undefined);
    vi.mocked(customerEmailTransport).mockImplementation(() => {
      throw new Error("BREVO_API_KEY must be set");
    });
    expect(await notifyRequester(DB, TICKET, { kind: "reply", body: "Thanks." })).toBe("failed");
    log.mockRestore();
  });
});
