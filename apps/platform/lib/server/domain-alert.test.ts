import { createAppEmailTransport, domainConnectedEmail } from "@fynix/email";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { notifyTeamDomainConnected } from "./domain-alert";

vi.mock("server-only", () => ({}));
vi.mock("@fynix/email", () => ({
  createAppEmailTransport: vi.fn(),
  domainConnectedEmail: vi.fn(),
  emailTeamInboxDefault: () => "hello@fynix.digital",
}));
vi.mock("./db", () => ({ getStaffDb: vi.fn(() => ({})) }));
vi.mock("./env", () => ({ serverEnv: () => ({ ADMIN_ORIGIN: "http://admin.localhost:3001" }) }));

const send = vi.fn();
const message = { to: "t", subject: "s", template: "domain-connected", bodyText: "b", bodyHtml: "h" };
const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);

beforeEach(() => {
  vi.resetAllMocks();
  consoleError.mockImplementation(() => undefined);
  vi.mocked(createAppEmailTransport).mockReturnValue({ send });
  vi.mocked(domainConnectedEmail).mockReturnValue(message);
  send.mockResolvedValue(undefined);
});

afterEach(() => {
  delete process.env.FYNIX_TEAM_EMAIL;
});

describe("notifyTeamDomainConnected", () => {
  it("emails the team inbox with the business, the domain and a link to the client", async () => {
    process.env.FYNIX_TEAM_EMAIL = "team@example.com";
    await notifyTeamDomainConnected("business-1", "Riverside Plumbing", "riverside.com");
    expect(domainConnectedEmail).toHaveBeenCalledWith({
      to: "team@example.com",
      businessName: "Riverside Plumbing",
      domain: "riverside.com",
      clientUrl: "http://admin.localhost:3001/clients/business-1",
    });
    expect(send).toHaveBeenCalledWith(message);
  });

  it("falls back to the default team inbox", async () => {
    await notifyTeamDomainConnected("business-1", "Riverside Plumbing", "riverside.com");
    expect(domainConnectedEmail).toHaveBeenCalledWith(expect.objectContaining({ to: "hello@fynix.digital" }));
  });

  it("logs and never throws when the email cannot be sent", async () => {
    send.mockRejectedValue(new Error("smtp down"));
    await expect(notifyTeamDomainConnected("business-1", "Riverside Plumbing", "riverside.com")).resolves.toBeUndefined();
    expect(consoleError).toHaveBeenCalled();
  });
});
