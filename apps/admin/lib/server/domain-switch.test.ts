import { findClientDetail, switchToDomain, type Database } from "@fynix/db";
import { domainMovedEmail } from "@fynix/email";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { customerEmailTransport } from "./email";
import { DomainSwitchRecipientMissingError, switchDomain } from "./domain-switch";

vi.mock("server-only", () => ({}));
vi.mock("@fynix/db", () => ({ findClientDetail: vi.fn(), switchToDomain: vi.fn() }));
vi.mock("@fynix/email", () => ({ domainMovedEmail: vi.fn() }));
vi.mock("./email", () => ({ customerEmailTransport: vi.fn() }));

const db = {} as Database;
const send = vi.fn();
const message = { to: "riley@example.com", subject: "s", template: "domain-moved", bodyText: "b", bodyHtml: "h" };

function client(email: string | null) {
  return { businessName: "Riverside Plumbing", owner: { name: "Riley", email, phone: null } } as Awaited<ReturnType<typeof findClientDetail>>;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(switchToDomain).mockResolvedValue({ oldHostname: "riverside.sites.example.test", newHostname: "riverside.com" });
  vi.mocked(findClientDetail).mockResolvedValue(client("riley@example.com"));
  vi.mocked(customerEmailTransport).mockReturnValue({ send });
  vi.mocked(domainMovedEmail).mockReturnValue(message);
  send.mockResolvedValue(undefined);
});

describe("switchDomain", () => {
  it("switches first, then emails the owner their new address and the old one that forwards", async () => {
    await expect(switchDomain(db, { businessId: "business-1" })).resolves.toBe("emailed");
    expect(switchToDomain).toHaveBeenCalledWith(db, { businessId: "business-1" });
    expect(domainMovedEmail).toHaveBeenCalledWith({
      to: "riley@example.com",
      businessName: "Riverside Plumbing",
      websiteUrl: "https://riverside.com",
      oldHostname: "riverside.sites.example.test",
    });
    expect(send).toHaveBeenCalledWith(message);
  });

  it("says so for an owner with no email address", async () => {
    vi.mocked(findClientDetail).mockResolvedValue(client(null));
    await expect(switchDomain(db, { businessId: "business-1" })).resolves.toBe("no-email");
    expect(send).not.toHaveBeenCalled();
  });

  it("throws when there is no owner at all", async () => {
    vi.mocked(findClientDetail).mockResolvedValue(null);
    await expect(switchDomain(db, { businessId: "business-1" })).rejects.toThrow(DomainSwitchRecipientMissingError);
  });

  it("lets the database's refusal through, before anything is sent", async () => {
    vi.mocked(switchToDomain).mockRejectedValue(new Error("not connected"));
    await expect(switchDomain(db, { businessId: "business-1" })).rejects.toThrow("not connected");
    expect(send).not.toHaveBeenCalled();
  });
});
