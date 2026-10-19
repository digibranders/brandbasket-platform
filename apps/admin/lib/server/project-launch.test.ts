import { findClientDetail, markProjectLive, setBusinessWebsiteUrl, type Database } from "@brandbasket/db";
import { websiteLiveEmail } from "@brandbasket/email";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { customerEmailTransport } from "./email";
import { ProjectLaunchDomainMissingError, ProjectLaunchRecipientMissingError, launchProject } from "./project-launch";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", () => {
  class MockInvalidWebsiteUrlError extends Error {}
  return { findClientDetail: vi.fn(), InvalidWebsiteUrlError: MockInvalidWebsiteUrlError, markProjectLive: vi.fn(), setBusinessWebsiteUrl: vi.fn() };
});
vi.mock("@brandbasket/email", () => ({ websiteLiveEmail: vi.fn() }));
vi.mock("./email", () => ({ customerEmailTransport: vi.fn() }));

const mockedMarkLive = vi.mocked(markProjectLive);
const mockedFindClient = vi.mocked(findClientDetail);
const mockedSetWebsiteUrl = vi.mocked(setBusinessWebsiteUrl);
const mockedCreateTransport = vi.mocked(customerEmailTransport);
const mockedWebsiteLiveEmail = vi.mocked(websiteLiveEmail);
const db = {} as Database;
const NOW = new Date("2026-09-18T12:00:00.000Z");
const send = vi.fn();

function clientReadyToLaunch(overrides: {
  readonly businessName?: string;
  readonly ownerEmail?: string | null;
  readonly hostname?: string | null;
} = {}) {
  return {
    businessId: "business-1",
    businessName: overrides.businessName ?? "Riverside Plumbing",
    owner: { name: "Riley Owner", email: overrides.ownerEmail === undefined ? "riley@example.com" : overrides.ownerEmail, phone: null },
    domain:
      overrides.hostname === undefined
        ? { hostname: "riverside-plumbing.com", ownerConfirmedAt: NOW }
        : overrides.hostname === null
          ? null
          : { hostname: overrides.hostname, ownerConfirmedAt: NOW },
  } as Awaited<ReturnType<typeof findClientDetail>>;
}

beforeEach(() => {
  vi.resetAllMocks();
  mockedMarkLive.mockResolvedValue({} as Awaited<ReturnType<typeof markProjectLive>>);
  mockedFindClient.mockResolvedValue(clientReadyToLaunch());
  mockedCreateTransport.mockReturnValue({ send });
  mockedWebsiteLiveEmail.mockReturnValue({
    to: "riley@example.com",
    subject: "Your Fynix website is live",
    template: "website-live",
    bodyText: "text",
    bodyHtml: "html",
  });
  send.mockResolvedValue(undefined);
});

describe("launchProject", () => {
  it("sets their website address to the domain they went live on", async () => {
    await launchProject(db, { businessId: "business-1" }, NOW);
    expect(mockedSetWebsiteUrl).toHaveBeenCalledWith(db, "business-1", "https://riverside-plumbing.com");
  });

  it("marks the project live before emailing the owner their real website address", async () => {
    await launchProject(db, { businessId: "business-1" }, NOW);

    expect(mockedMarkLive).toHaveBeenCalledWith(db, { businessId: "business-1", now: NOW });
    expect(mockedWebsiteLiveEmail).toHaveBeenCalledWith({
      to: "riley@example.com",
      businessName: "Riverside Plumbing",
      websiteUrl: "https://riverside-plumbing.com",
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(mockedMarkLive.mock.invocationCallOrder[0]).toBeLessThan(mockedFindClient.mock.invocationCallOrder[0] ?? 0);
  });

  it("says the owner was emailed", async () => {
    await expect(launchProject(db, { businessId: "business-1" }, NOW)).resolves.toBe("emailed");
  });

  it("goes live and emails nobody when the owner signs in with a mobile number, and says so", async () => {
    mockedFindClient.mockResolvedValue(clientReadyToLaunch({ ownerEmail: null }));

    await expect(launchProject(db, { businessId: "business-1" }, NOW)).resolves.toBe("no-email");
    expect(mockedMarkLive).toHaveBeenCalledTimes(1);
    expect(mockedWebsiteLiveEmail).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("does not look up the client or send an email when marking it live fails", async () => {
    const refusal = new Error("Business business-1 has no approved project to launch.");
    mockedMarkLive.mockRejectedValue(refusal);

    await expect(launchProject(db, { businessId: "business-1" }, NOW)).rejects.toBe(refusal);
    expect(mockedFindClient).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("throws rather than silently skipping the email when the business has no owner", async () => {
    mockedFindClient.mockResolvedValue({ businessId: "business-1", owner: null, domain: null } as Awaited<
      ReturnType<typeof findClientDetail>
    >);

    await expect(launchProject(db, { businessId: "business-1" }, NOW)).rejects.toThrow(
      ProjectLaunchRecipientMissingError,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("throws rather than silently skipping the email when the business has no domain", async () => {
    mockedFindClient.mockResolvedValue(clientReadyToLaunch({ hostname: null }));

    await expect(launchProject(db, { businessId: "business-1" }, NOW)).rejects.toThrow(
      ProjectLaunchDomainMissingError,
    );
    expect(send).not.toHaveBeenCalled();
  });
});
