import { findClientDetail, markDomainReadyForDns, type Database } from "@fynix/db";
import { domainReadyEmail } from "@fynix/email";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { markDomainReady, DomainReadyRecipientMissingError } from "./domain-ready";
import { customerEmailTransport } from "./email";

vi.mock("server-only", () => ({}));
vi.mock("@fynix/db", () => ({ findClientDetail: vi.fn(), markDomainReadyForDns: vi.fn() }));
vi.mock("@fynix/email", () => ({ domainReadyEmail: vi.fn() }));
vi.mock("./email", () => ({ customerEmailTransport: vi.fn() }));
vi.mock("./env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.example.test" }) }));

const db = {} as Database;
const send = vi.fn();
const message = { to: "riley@example.com", subject: "s", template: "domain-ready", bodyText: "b", bodyHtml: "h" };

function client(email: string | null) {
  return { businessName: "Riverside Plumbing", owner: { name: "Riley", email, phone: null } } as Awaited<ReturnType<typeof findClientDetail>>;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(markDomainReadyForDns).mockResolvedValue({ hostname: "riverside.com", changed: true });
  vi.mocked(findClientDetail).mockResolvedValue(client("riley@example.com"));
  vi.mocked(customerEmailTransport).mockReturnValue({ send });
  vi.mocked(domainReadyEmail).mockReturnValue(message);
  send.mockResolvedValue(undefined);
});

describe("markDomainReady", () => {
  it("moves the domain to the DNS step, then emails the owner a link to their domain page", async () => {
    await expect(markDomainReady(db, { businessId: "business-1" })).resolves.toBe("emailed");
    expect(markDomainReadyForDns).toHaveBeenCalledWith(db, { businessId: "business-1" });
    expect(domainReadyEmail).toHaveBeenCalledWith({
      to: "riley@example.com",
      businessName: "Riverside Plumbing",
      domain: "riverside.com",
      projectUrl: "https://app.example.test/domain",
    });
    expect(send).toHaveBeenCalledWith(message);
  });

  it("sends nothing the second time", async () => {
    vi.mocked(markDomainReadyForDns).mockResolvedValue({ hostname: "riverside.com", changed: false });
    await expect(markDomainReady(db, { businessId: "business-1" })).resolves.toBe("unchanged");
    expect(send).not.toHaveBeenCalled();
  });

  it("says so for an owner with no email address", async () => {
    vi.mocked(findClientDetail).mockResolvedValue(client(null));
    await expect(markDomainReady(db, { businessId: "business-1" })).resolves.toBe("no-email");
    expect(send).not.toHaveBeenCalled();
  });

  it("throws when there is no owner at all", async () => {
    vi.mocked(findClientDetail).mockResolvedValue(null);
    await expect(markDomainReady(db, { businessId: "business-1" })).rejects.toThrow(DomainReadyRecipientMissingError);
  });

  it("lets the database's refusal through, before anything is sent", async () => {
    vi.mocked(markDomainReadyForDns).mockRejectedValue(new Error("not approved"));
    await expect(markDomainReady(db, { businessId: "business-1" })).rejects.toThrow("not approved");
    expect(send).not.toHaveBeenCalled();
  });
});
