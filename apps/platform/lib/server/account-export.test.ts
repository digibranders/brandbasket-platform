import { describe, expect, it, vi } from "vitest";
import {
  getSupportTicket,
  listConsents,
  listExportedSessions,
  listSupportTickets,
  readExportedAccount,
  readExportedBusiness,
  type Database,
} from "@firstfold/db";
import { DATA_RECIPIENTS } from "@firstfold/shared/lib/privacy/recipients";
import { ACCOUNT_EXPORT_FORMAT, ACCOUNT_EXPORT_NOT_INCLUDED, accountExportFilename, accountExportFormat, buildAccountExport } from "./account-export";

vi.mock("server-only", () => ({}));
vi.mock("@firstfold/db", () => ({
  getSupportTicket: vi.fn(),
  listConsents: vi.fn(),
  listExportedSessions: vi.fn(),
  listSupportTickets: vi.fn(),
  readExportedAccount: vi.fn(),
  readExportedBusiness: vi.fn(),
}));

const NOW = new Date("2026-11-01T06:00:00.000Z");
const dbs = { app: {} as Database, staff: {} as Database };
const INPUT = { userId: "user-asha", businessId: "0198f2c0-0000-7000-8000-000000000001", now: NOW };

function account(overrides: Record<string, unknown> = {}) {
  return {
    id: "user-asha",
    name: "Asha Rao",
    email: "phone-919876543210@placeholder.invalid",
    emailVerified: false,
    phoneNumber: "+919876543210",
    phoneNumberVerified: true,
    createdAt: new Date("2026-09-01T00:00:00.000Z"),
    ...overrides,
  };
}

function arrange(accountRow: ReturnType<typeof account> | null = account()): void {
  vi.mocked(readExportedAccount).mockResolvedValue(accountRow as never);
  vi.mocked(listExportedSessions).mockResolvedValue([{ startedAt: NOW, expiresAt: NOW, ipAddress: "203.0.113.9", userAgent: "Safari" }]);
  vi.mocked(readExportedBusiness).mockResolvedValue({ business: { id: INPUT.businessId, name: "Asha Dental" }, profile: null, billingProfile: null, subscription: null, payments: [], taxInvoices: [], directoryProfile: null } as never);
  vi.mocked(listConsents).mockResolvedValue([{ id: "c1", purpose: "account_terms", event: "given", noticeVersion: "2026-10-13", language: "en", channel: "web", ipHash: "secrethash", createdAt: NOW }]);
  vi.mocked(listSupportTickets).mockResolvedValue({ items: [{ id: "t1" }], nextCursor: null } as never);
  vi.mocked(getSupportTicket).mockResolvedValue({
    ticket: { id: "t1", displayRef: "FF-1001", category: "billing", subject: "Invoice", status: "closed", createdAt: NOW },
    messages: [{ createdAt: NOW, body: "Hello" }],
    attachments: [{ id: "a1" }],
  } as never);
}

describe("buildAccountExport", () => {
  it("returns the account, business, sign-ins, support requests and consents, with who the data is shared with and what is left out", async () => {
    arrange();
    const file = await buildAccountExport(dbs, INPUT);
    expect(file.format).toBe(ACCOUNT_EXPORT_FORMAT);
    expect(file.generatedAt).toBe("2026-11-01T06:00:00.000Z");
    expect(file.account).toMatchObject({ name: "Asha Rao", mobileNumber: "+919876543210", mobileNumberConfirmed: true });
    expect(file.signIns).toHaveLength(1);
    expect(file.business.business).toMatchObject({ name: "Asha Dental" });
    expect(file.supportRequests).toEqual([
      { reference: "FF-1001", category: "billing", subject: "Invoice", status: "closed", createdAt: NOW, messages: [{ sentAt: NOW, body: "Hello" }], screenshots: 1 },
    ]);
    expect(file.consents).toEqual([{ purpose: "account_terms", event: "given", noticeVersion: "2026-10-13", channel: "web", recordedAt: NOW }]);
    expect(file.sharedWith).toBe(DATA_RECIPIENTS);
    expect(file.notIncluded).toBe(ACCOUNT_EXPORT_NOT_INCLUDED);
  });

  it("leaves out the placeholder address of a number account, and the hashed address inside a consent record", async () => {
    arrange();
    const text = JSON.stringify(await buildAccountExport(dbs, INPUT));
    expect(text).not.toContain("placeholder.invalid");
    expect(text).not.toContain("secrethash");
  });

  it("includes the address of an older account that has one, with whether it was confirmed", async () => {
    arrange(account({ email: "asha@example.com", emailVerified: true, phoneNumber: null, phoneNumberVerified: false }));
    const file = await buildAccountExport(dbs, INPUT);
    expect(file.account).toMatchObject({ email: "asha@example.com", emailConfirmed: true, mobileNumber: null });
  });

  it("pages through the support requests 25 at a time and stops at 100", async () => {
    arrange();
    const page = (from: number, next: string | null) => ({ items: Array.from({ length: 25 }, (_, n) => ({ id: `t${from + n}` })), nextCursor: next });
    vi.mocked(listSupportTickets)
      .mockReset()
      .mockResolvedValueOnce(page(0, "c1") as never)
      .mockResolvedValueOnce(page(25, "c2") as never)
      .mockResolvedValueOnce(page(50, "c3") as never)
      .mockResolvedValueOnce(page(75, "c4") as never)
      .mockResolvedValue(page(100, "c5") as never);
    await buildAccountExport(dbs, INPUT);
    expect(listSupportTickets).toHaveBeenCalledTimes(4);
    expect(listSupportTickets).toHaveBeenNthCalledWith(2, dbs.app, "user-asha", { limit: 25, cursor: "c1" });
    expect(getSupportTicket).toHaveBeenCalledTimes(100);
  });

  it("reads only this user's and this business's records, and tolerates an account that is gone", async () => {
    arrange(null);
    const file = await buildAccountExport(dbs, INPUT);
    expect(file.account).toBeNull();
    expect(readExportedAccount).toHaveBeenCalledWith(dbs.staff, "user-asha");
    expect(readExportedBusiness).toHaveBeenCalledWith(dbs.staff, INPUT.businessId);
    expect(listSupportTickets).toHaveBeenCalledWith(dbs.app, "user-asha", { limit: 25 });
  });
});

describe("the export's names", () => {
  it("are Firstfold's with no brand set, and Fynix's on a Fynix server, with nothing of Firstfold", () => {
    expect(accountExportFormat({})).toBe(ACCOUNT_EXPORT_FORMAT);
    expect(accountExportFilename("2026-11-01", {})).toBe("firstfold-my-data-2026-11-01.json");
    expect(accountExportFormat({ PLATFORM_BRAND: "fynix" })).toBe("fynix-account-export/1");
    expect(accountExportFilename("2026-11-01", { PLATFORM_BRAND: "fynix" })).toBe("fynix-my-data-2026-11-01.json");
  });
});
