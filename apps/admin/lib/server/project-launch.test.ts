import {
  findClientDetail,
  LAUNCH_CHECK_KEYS,
  listLaunchChecks,
  markProjectLive,
  setBusinessWebsiteUrl,
  setLaunchCheck,
  type Database,
} from "@brandbasket/db";
import { websiteLiveEmail } from "@brandbasket/email";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { customerEmailTransport } from "./email";
import {
  ProjectLaunchChecksMissingError,
  ProjectLaunchDomainMissingError,
  ProjectLaunchRecipientMissingError,
  launchProject,
  resendLaunchEmail,
  saveLaunchChecks,
} from "./project-launch";

vi.mock("server-only", () => ({}));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    findClientDetail: vi.fn(),
    listLaunchChecks: vi.fn(),
    markProjectLive: vi.fn(),
    setBusinessWebsiteUrl: vi.fn(),
    setLaunchCheck: vi.fn(),
  };
});
vi.mock("@brandbasket/email", () => ({ websiteLiveEmail: vi.fn() }));
vi.mock("./email", () => ({ customerEmailTransport: vi.fn() }));

const mockedMarkLive = vi.mocked(markProjectLive);
const mockedFindClient = vi.mocked(findClientDetail);
const mockedListChecks = vi.mocked(listLaunchChecks);
const mockedSetCheck = vi.mocked(setLaunchCheck);
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
  readonly projectStatus?: string;
  readonly launchedAt?: Date | null;
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
    project: {
      id: "project-1",
      status: overrides.projectStatus ?? "approved",
      launchedAt: overrides.launchedAt ?? null,
    },
  } as unknown as Awaited<ReturnType<typeof findClientDetail>>;
}

const ALL_CHECKS = LAUNCH_CHECK_KEYS.map((key) => ({ key, checkedByStaffId: "staff-1", checkedAt: NOW }));

beforeEach(() => {
  vi.resetAllMocks();
  mockedMarkLive.mockResolvedValue({} as Awaited<ReturnType<typeof markProjectLive>>);
  mockedFindClient.mockResolvedValue(clientReadyToLaunch());
  mockedListChecks.mockResolvedValue(ALL_CHECKS);
  mockedSetCheck.mockResolvedValue(undefined);
  mockedCreateTransport.mockReturnValue({ send });
  mockedWebsiteLiveEmail.mockReturnValue({
    to: "riley@example.com",
    subject: "Your Brandbasket website is live",
    template: "website-live",
    bodyText: "text",
    bodyHtml: "html",
  });
  send.mockResolvedValue(undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("launchProject", () => {
  it("sets their website address to the domain they went live on", async () => {
    await launchProject(db, { businessId: "business-1" }, NOW);
    expect(mockedSetWebsiteUrl).toHaveBeenCalledWith(db, "business-1", "https://riverside-plumbing.com");
  });

  it("reads the client, marks the project live, then emails the owner their real website address", async () => {
    await launchProject(db, { businessId: "business-1" }, NOW);

    expect(mockedMarkLive).toHaveBeenCalledWith(db, { businessId: "business-1", now: NOW });
    expect(mockedWebsiteLiveEmail).toHaveBeenCalledWith({
      to: "riley@example.com",
      businessName: "Riverside Plumbing",
      websiteUrl: "https://riverside-plumbing.com",
    });
    expect(send).toHaveBeenCalledTimes(1);
    expect(mockedFindClient.mock.invocationCallOrder[0]).toBeLessThan(mockedMarkLive.mock.invocationCallOrder[0] ?? 0);
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

  it("stays live and reports email-failed when the send fails", async () => {
    send.mockRejectedValue(new Error("brevo down"));

    await expect(launchProject(db, { businessId: "business-1" }, NOW)).resolves.toBe("email-failed");
    expect(mockedMarkLive).toHaveBeenCalledTimes(1);
    expect(mockedSetWebsiteUrl).toHaveBeenCalledTimes(1);
    expect(console.error).toHaveBeenCalledWith("[launch-email]", expect.objectContaining({ businessId: "business-1" }));
  });

  it("saves no website address and sends no email when marking it live fails", async () => {
    const refusal = new Error("Business business-1 has no approved project to launch.");
    mockedMarkLive.mockRejectedValue(refusal);

    await expect(launchProject(db, { businessId: "business-1" }, NOW)).rejects.toBe(refusal);
    expect(mockedSetWebsiteUrl).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("throws and marks nothing live when the business has no owner", async () => {
    mockedFindClient.mockResolvedValue({
      businessId: "business-1",
      owner: null,
      domain: { hostname: "riverside-plumbing.com", ownerConfirmedAt: NOW },
    } as Awaited<ReturnType<typeof findClientDetail>>);

    await expect(launchProject(db, { businessId: "business-1" }, NOW)).rejects.toThrow(
      ProjectLaunchRecipientMissingError,
    );
    expect(mockedMarkLive).not.toHaveBeenCalled();
    expect(mockedSetWebsiteUrl).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("throws and marks nothing live when the business has no domain", async () => {
    mockedFindClient.mockResolvedValue(clientReadyToLaunch({ hostname: null }));

    await expect(launchProject(db, { businessId: "business-1" }, NOW)).rejects.toThrow(
      ProjectLaunchDomainMissingError,
    );
    expect(mockedMarkLive).not.toHaveBeenCalled();
    expect(mockedSetWebsiteUrl).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("throws and marks nothing live when the client cannot be found", async () => {
    mockedFindClient.mockResolvedValue(null);

    await expect(launchProject(db, { businessId: "business-1" }, NOW)).rejects.toThrow(
      ProjectLaunchRecipientMissingError,
    );
    expect(mockedMarkLive).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });

  it("throws and marks nothing live while any launch check is unticked", async () => {
    mockedListChecks.mockResolvedValue(ALL_CHECKS.filter((check) => check.key !== "mobile_checked"));

    await expect(launchProject(db, { businessId: "business-1" }, NOW)).rejects.toThrow(ProjectLaunchChecksMissingError);
    expect(mockedListChecks).toHaveBeenCalledWith(db, { projectId: "project-1", businessId: "business-1" });
    expect(mockedMarkLive).not.toHaveBeenCalled();
    expect(mockedSetWebsiteUrl).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("resendLaunchEmail", () => {
  it("sends the website-live email again within 7 days of going live, changing nothing", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      mockedFindClient.mockResolvedValue(clientReadyToLaunch({ projectStatus: "live", launchedAt: new Date(NOW.getTime() - 6 * 86_400_000) }));

      await expect(resendLaunchEmail(db, { businessId: "business-1" })).resolves.toBe("emailed");
      expect(mockedWebsiteLiveEmail).toHaveBeenCalledWith({
        to: "riley@example.com",
        businessName: "Riverside Plumbing",
        websiteUrl: "https://riverside-plumbing.com",
      });
      expect(mockedMarkLive).not.toHaveBeenCalled();
      expect(mockedSetWebsiteUrl).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("is not allowed once 7 days have passed since going live", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      mockedFindClient.mockResolvedValue(clientReadyToLaunch({ projectStatus: "live", launchedAt: new Date(NOW.getTime() - 8 * 86_400_000) }));

      await expect(resendLaunchEmail(db, { businessId: "business-1" })).resolves.toBe("not-allowed");
      expect(send).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("is not allowed while the project is not live", async () => {
    mockedFindClient.mockResolvedValue(clientReadyToLaunch({ projectStatus: "approved" }));

    await expect(resendLaunchEmail(db, { businessId: "business-1" })).resolves.toBe("not-allowed");
    expect(send).not.toHaveBeenCalled();
  });

  it("says no email was sent when the owner signs in with a mobile number", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      mockedFindClient.mockResolvedValue(clientReadyToLaunch({ ownerEmail: null, projectStatus: "live", launchedAt: NOW }));

      await expect(resendLaunchEmail(db, { businessId: "business-1" })).resolves.toBe("no-email");
      expect(send).not.toHaveBeenCalled();
    } finally {
      vi.useRealTimers();
    }
  });

  it("reports email-failed when the send fails, and never throws", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    try {
      mockedFindClient.mockResolvedValue(clientReadyToLaunch({ projectStatus: "live", launchedAt: NOW }));
      send.mockRejectedValue(new Error("brevo down"));

      await expect(resendLaunchEmail(db, { businessId: "business-1" })).resolves.toBe("email-failed");
      expect(console.error).toHaveBeenCalledWith("[launch-email]", expect.anything());
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("saveLaunchChecks", () => {
  it("ticks the checks on the form and unticks the rest, as the signed-in staff member", async () => {
    mockedFindClient.mockResolvedValue(clientReadyToLaunch());

    await expect(
      saveLaunchChecks(db, { businessId: "business-1", staffId: "staff-1", ticked: ["mobile_checked"], now: NOW }),
    ).resolves.toBe("saved");

    expect(mockedSetCheck).toHaveBeenCalledTimes(LAUNCH_CHECK_KEYS.length);
    expect(mockedSetCheck).toHaveBeenCalledWith(db, {
      projectId: "project-1",
      businessId: "business-1",
      key: "mobile_checked",
      staffId: "staff-1",
      checked: true,
      now: NOW,
    });
    expect(mockedSetCheck).toHaveBeenCalledWith(db, expect.objectContaining({ key: "dns_and_https", checked: false }));
  });

  it("writes nothing when the project is not approved", async () => {
    mockedFindClient.mockResolvedValue(clientReadyToLaunch({ projectStatus: "preview" }));

    await expect(
      saveLaunchChecks(db, { businessId: "business-1", staffId: "staff-1", ticked: ["mobile_checked"], now: NOW }),
    ).resolves.toBe("not-allowed");
    expect(mockedSetCheck).not.toHaveBeenCalled();
  });
});
