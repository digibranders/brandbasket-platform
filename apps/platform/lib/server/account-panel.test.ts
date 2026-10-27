import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAccountPanel } from "./account-panel";
import { getBillingBanner } from "./billing-banner";
import { requireCustomerAccess } from "./customer-access";
import { getLatestProjectStatus, getLiveWebsite, getProjectOverview } from "./onboarding";
import { loadRequestNeeds, loadUnreadReplies } from "./requests";

vi.mock("server-only", () => ({}));
vi.mock("./billing-banner", () => ({ getBillingBanner: vi.fn() }));
vi.mock("./customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("./onboarding", () => ({ getLatestProjectStatus: vi.fn(), getLiveWebsite: vi.fn(), getProjectOverview: vi.fn() }));
vi.mock("./requests", () => ({ loadRequestNeeds: vi.fn(), loadUnreadReplies: vi.fn() }));

const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" } as const;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant, billing: { hasWebsite: true } } as never);
  vi.mocked(getBillingBanner).mockResolvedValue(null);
  vi.mocked(getProjectOverview).mockResolvedValue({ project: null, completed: [] });
  vi.mocked(getLiveWebsite).mockResolvedValue({ hostname: "cafe.example", launchedAt: new Date("2026-10-01T00:00:00Z") } as never);
  vi.mocked(getLatestProjectStatus).mockResolvedValue("live");
  vi.mocked(loadRequestNeeds).mockResolvedValue([]);
  vi.mocked(loadUnreadReplies).mockResolvedValue([]);
});

describe("getAccountPanel", () => {
  it("has no request lines when nothing waits on the customer", async () => {
    const panel = await getAccountPanel();
    expect(panel.notices).toEqual([]);
  });

  it("puts a quote to answer, a change to check and a reply to read in the bell, and the first two light it", async () => {
    vi.mocked(loadRequestNeeds).mockResolvedValue([
      { ticketId: "t1", subject: "Add an Implants page", kind: "website", state: "quoted", quote: null, acceptedAt: null, updatedAt: new Date() },
      { ticketId: "t2", subject: "Change the main photo", kind: "website", state: "preview", quote: null, acceptedAt: null, updatedAt: new Date() },
    ]);
    vi.mocked(loadUnreadReplies).mockResolvedValue([{ ticketId: "t3", subject: "A question" }]);
    const panel = await getAccountPanel();
    expect(panel.notices.map((notice) => [notice.text, notice.actionable])).toEqual([
      ["Quote waiting: Add an Implants page", true],
      ["Ready to check: Change the main photo", true],
      ["New reply: A question", false],
    ]);
  });
});
