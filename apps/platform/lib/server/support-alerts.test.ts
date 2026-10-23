import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Database } from "@brandbasket/db";
import { sendSupportReplyAlert, sendSupportTicketAlert, sendSystemErrorAlert } from "./support-alerts";
import { createAppEmailTransport } from "@brandbasket/email";
import { getSupportTicket } from "@brandbasket/db";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => ({
  getSupportTicket: vi.fn(),
}));
vi.mock("@brandbasket/email", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@brandbasket/email")>();
  return {
    ...actual,
    createAppEmailTransport: vi.fn(),
  };
});
const staffDb = { role: "staff" } as unknown as Database;
vi.mock("./db", () => ({ getStaffDb: () => staffDb }));
vi.mock("@/lib/server/env", () => ({
  serverEnv: () => ({ ADMIN_ORIGIN: "https://console.brandbasket.in" }),
}));

describe("support-alerts", () => {
  const mockSend = vi.fn();
  const db = { role: "app" } as unknown as Database;

  beforeEach(() => {
    vi.clearAllMocks();
    mockSend.mockReset();
    mockSend.mockResolvedValue(undefined);
    vi.mocked(createAppEmailTransport).mockReturnValue({ send: mockSend });
    process.env.SUPPORT_ALERT_EMAIL = "support@brandbasket.in";
    process.env.BRANDBASKET_TEAM_EMAIL = "team@brandbasket.in";
  });

  describe("sendSupportTicketAlert", () => {
    it("sends formatted ticket alert to support inbox", async () => {
      await sendSupportTicketAlert(
        { id: "0192d1a0-0000-7000-8000-000000000001", displayRef: "SUP-A1B2C3" },
        {
          category: "account_access",
          subject: "Cannot reset 2FA",
          description: "Locked out of my device.",
          attachmentIds: ["att-1", "att-2"],
          browserDevice: "Chrome on macOS",
        },
        {
          user: { id: "u-1", name: "Alice Smith", email: "alice@example.com", phone: "+919876543210" },
          businessId: "biz-1",
          businessName: "Smith Clinic",
        },
      );

      // The staff connection can insert into the outbox; the customer connection cannot.
      expect(createAppEmailTransport).toHaveBeenCalledWith(staffDb);
      expect(createAppEmailTransport).not.toHaveBeenCalledWith(db);
      expect(mockSend).toHaveBeenCalledTimes(1);
      const sent = mockSend.mock.calls[0][0];
      expect(sent.to).toBe("support@brandbasket.in");
      expect(sent.subject).toContain("SUP-A1B2C3");
      expect(sent.subject).toContain("Cannot reset 2FA");
      expect(sent.bodyText).toContain("Locked out of my device.");
      expect(sent.bodyText).toContain("Alice Smith");
      expect(sent.bodyText).toContain("alice@example.com");
      expect(sent.bodyText).toContain("Business: Smith Clinic");
      expect(sent.bodyHtml).toContain("https://console.brandbasket.in/support/0192d1a0-0000-7000-8000-000000000001");
    });

    it("keeps the request text, name, email and phone out of the outbox copy", async () => {
      await sendSupportTicketAlert(
        { id: "0192d1a0-0000-7000-8000-000000000001", displayRef: "SUP-A1B2C3" },
        { category: "account_access", subject: "Cannot reset 2FA", description: "Locked out of my device." },
        { user: { id: "u-1", name: "Alice Smith", email: "alice@example.com", phone: "+919876543210" } },
      );
      const copy = JSON.stringify(mockSend.mock.calls[0][0].outboxCopy);
      expect(copy).toContain("SUP-A1B2C3");
      expect(copy).toContain("https://console.brandbasket.in/support/0192d1a0-0000-7000-8000-000000000001");
      for (const secret of ["Cannot reset 2FA", "Locked out", "Alice", "alice@example.com", "9876543210"]) expect(copy).not.toContain(secret);
    });

    it("does not throw if transport fails", async () => {
      mockSend.mockRejectedValueOnce(new Error("Brevo down"));
      const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

      await expect(
        sendSupportTicketAlert(
          { id: "0192d1a0-0000-7000-8000-000000000001", displayRef: "SUP-A1B2C3" },
          { category: "general", subject: "Help", description: "Details" },
          { user: { id: "u-1", name: "Bob", email: "bob@example.com" } },
        ),
      ).resolves.toBeUndefined();

      expect(consoleError).toHaveBeenCalled();
      consoleError.mockRestore();
    });
  });

  describe("sendSupportReplyAlert", () => {
    it("sends formatted reply alert when ticket detail is resolved", async () => {
      vi.mocked(getSupportTicket).mockResolvedValueOnce({
        ticket: {
          id: "0192d1a0-0000-7000-8000-000000000001",
          displayRef: "SUP-A1B2C3",
          subject: "Cannot reset 2FA",
          category: "account_access",
          status: "in_progress",
          priority: "high",
          assignedStaffId: null,
          createdAt: new Date(),
          updatedAt: new Date(),
          context: null,
          version: 1,
        },
        messages: [],
        events: [],
        attachments: [],
        errorLinks: [],
      } as unknown as Awaited<ReturnType<typeof getSupportTicket>>);

      await sendSupportReplyAlert(
        db,
        "0192d1a0-0000-7000-8000-000000000001",
        { body: "I have uploaded the document.", attachmentIds: ["att-1"] },
        { user: { id: "u-1", name: "Alice", email: "alice@example.com" } },
      );

      expect(mockSend).toHaveBeenCalledTimes(1);
      const sent = mockSend.mock.calls[0][0];
      expect(sent.to).toBe("support@brandbasket.in");
      expect(sent.subject).toContain("SUP-A1B2C3");
      expect(sent.bodyText).toContain("I have uploaded the document.");
      expect(sent.bodyText).toContain("Alice");
      expect(createAppEmailTransport).toHaveBeenCalledWith(staffDb);
      expect(getSupportTicket).toHaveBeenCalledWith(db, "u-1", "0192d1a0-0000-7000-8000-000000000001");
      const copy = JSON.stringify(sent.outboxCopy);
      expect(copy).toContain("Account access");
      expect(copy).toContain("In progress");
      for (const secret of ["I have uploaded the document.", "Alice", "alice@example.com", "Cannot reset 2FA"]) expect(copy).not.toContain(secret);
    });

    it("skips and does not throw when ticket is not found", async () => {
      vi.mocked(getSupportTicket).mockResolvedValueOnce(null);
      const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});

      await expect(
        sendSupportReplyAlert(
          db,
          "missing-id",
          { body: "Reply" },
          { user: { id: "u-1", name: "Alice", email: "alice@example.com" } },
        ),
      ).resolves.toBeUndefined();

      expect(mockSend).not.toHaveBeenCalled();
      expect(consoleWarn).toHaveBeenCalled();
      consoleWarn.mockRestore();
    });
  });

  describe("sendSystemErrorAlert", () => {
    it("sends system error alert and deduplicates subsequent occurrences within debounce window", async () => {
      await sendSystemErrorAlert({
        app: "platform",
        operation: "server_action",
        errorClass: "DatabaseConnectionTimeout",
        route: "/api/checkout",
        severity: "error",
        release: "v1.2.3",
        browser: "Firefox 130",
        eventId: "err-evt-456",
      });

      expect(mockSend).toHaveBeenCalledTimes(1);
      const sent = mockSend.mock.calls[0][0];
      expect(sent.to).toBe("support@brandbasket.in");
      expect(sent.subject).toContain("DatabaseConnectionTimeout");
      expect(sent.subject).toContain("/api/checkout");
      expect(sent.bodyText).toContain("err-evt-456");

      // Same error & route within 5 minutes is debounced
      await sendSystemErrorAlert({
        app: "platform",
        operation: "server_action",
        errorClass: "DatabaseConnectionTimeout",
        route: "/api/checkout",
        severity: "error",
      });

      // Still only called once
      expect(mockSend).toHaveBeenCalledTimes(1);
    });
  });
});
