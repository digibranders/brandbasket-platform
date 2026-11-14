import { isPhoneAccountEmail, shouldEmail, type Database } from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { sendRequestAcknowledgement } from "./server";
import { customerEmailTransport } from "@/features/server-common/email";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.brandbasket.in" }) }));
vi.mock("@/features/server-common/email", () => ({ customerEmailTransport: vi.fn() }));
vi.mock("@brandbasket/db", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@brandbasket/db")>()),
  isPhoneAccountEmail: vi.fn(),
  shouldEmail: vi.fn(),
}));

const DB = { kind: "staff-db" } as unknown as Database;
const TICKET = { id: "0192f3c4-0000-7000-8000-0000000000aa" };
const REQUEST = { subject: "Add an Implants page" };
const USER = { id: "user-1", name: "Priya Shah", email: "priya@example.com", phone: "+919820011223" };
const CUSTOMER = { user: USER, businessId: "business-1", businessName: "Riverside Plumbing" };

const send = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isPhoneAccountEmail).mockReturnValue(false);
  vi.mocked(shouldEmail).mockResolvedValue(true);
  vi.mocked(customerEmailTransport).mockReturnValue({ send } as never);
  send.mockResolvedValue(undefined);
});

describe("sendRequestAcknowledgement", () => {
  it("sends an acknowledgement email with canonical request URL to customer", async () => {
    await sendRequestAcknowledgement(DB, TICKET, REQUEST, CUSTOMER);

    expect(customerEmailTransport).toHaveBeenCalledWith(DB);
    expect(send).toHaveBeenCalledOnce();
    const message = send.mock.calls[0]?.[0];
    expect(message).toMatchObject({
      to: "priya@example.com",
      subject: "We received your request: Add an Implants page",
      template: "request-acknowledgement",
    });
    expect(message?.bodyText).toContain("https://app.brandbasket.in/requests/0192f3c4-0000-7000-8000-0000000000aa");
  });

  it("skips sending when user signed in with phone only (placeholder email)", async () => {
    vi.mocked(isPhoneAccountEmail).mockReturnValue(true);

    await sendRequestAcknowledgement(DB, TICKET, REQUEST, CUSTOMER);

    expect(send).not.toHaveBeenCalled();
  });

  it("skips sending when email preference disallows request_reply", async () => {
    vi.mocked(shouldEmail).mockResolvedValue(false);

    await sendRequestAcknowledgement(DB, TICKET, REQUEST, CUSTOMER);

    expect(send).not.toHaveBeenCalled();
  });

  it("never throws when transport fails", async () => {
    send.mockRejectedValue(new Error("Brevo down"));

    await expect(sendRequestAcknowledgement(DB, TICKET, REQUEST, CUSTOMER)).resolves.toBeUndefined();
  });
});
