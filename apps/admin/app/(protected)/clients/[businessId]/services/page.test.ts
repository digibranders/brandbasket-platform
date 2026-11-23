import { listAddOnsToContact, listLiveServiceLines } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isWebsiteBought } from "@/lib/server/bought-services";
import { loadClientChatbots } from "@/lib/server/chatbots-admin";
import { openClientTab } from "@/lib/server/client-page";
import { NumbersSection } from "@/components/console/numbers-section";
import ClientServicesPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://console.example.com" }) }));
vi.mock("@/lib/server/client-page", () => ({ openClientTab: vi.fn() }));
vi.mock("@/lib/server/bought-services", () => ({ isWebsiteBought: vi.fn() }));
vi.mock("@/lib/server/chatbots-admin", () => ({ loadClientChatbots: vi.fn() }));
vi.mock("@/components/client-chatbots", () => ({ ClientChatbots: () => "[chatbots]" }));
vi.mock("@/components/console/work-section", () => ({ WorkSection: () => "[work]" }));
vi.mock("@/components/console/numbers-section", () => ({ NumbersSection: vi.fn(() => "[numbers]") }));
vi.mock("@/components/console/campaigns-section", () => ({ CampaignsSection: () => "[campaigns]" }));
vi.mock("@/components/console/accounts-section", () => ({ AccountsSection: () => "[accounts]" }));
vi.mock("@/components/console/updates-section", () => ({ UpdatesSection: () => "[updates]" }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    findSetupCallBooking: vi.fn().mockResolvedValue(null),
    findOpenClosureForBusiness: vi.fn().mockResolvedValue(null),
    listOpenPrivacyRequests: vi.fn().mockResolvedValue([]),
    listPaymentsNeedingAttention: vi.fn().mockResolvedValue([]),
    listLiveServiceLines: vi.fn(),
    listAddOnsToContact: vi.fn(),
  };
});

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const CLIENT = { businessId: BUSINESS, businessName: "Harbour Bakery", owner: null, billing: { subscription: null, firstPayment: null }, movingTo: null, domain: null, project: null };
const PAID_ADS = [{ businessId: BUSINESS, addOn: "paid-ads", netAmountCents: 1, status: "active" }] as never;

async function open(query: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(await ClientServicesPage({ params: Promise.resolve({ businessId: BUSINESS }), searchParams: Promise.resolve(query) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(openClientTab).mockResolvedValue({ granted: { staff: { role: "admin" } }, client: CLIENT } as never);
  vi.mocked(listLiveServiceLines).mockResolvedValue([]);
  vi.mocked(listAddOnsToContact).mockResolvedValue([]);
  vi.mocked(isWebsiteBought).mockResolvedValue(true);
  vi.mocked(loadClientChatbots).mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("the Services tab", () => {
  it("is an empty state before they have any service", async () => {
    const html = await open();
    expect(html).toContain("No services yet.");
    expect(html).not.toContain("[numbers]");
  });

  it("shows a card per service, the Paid Ads figures in the Paid Ads card, the chatbots and the legacy tools", async () => {
    vi.mocked(listLiveServiceLines).mockResolvedValue([...PAID_ADS, { businessId: BUSINESS, addOn: "social-media", netAmountCents: 1, status: "active" }] as never);
    const html = await open();
    expect(html).toContain("Paid Ads Management");
    expect(html).toContain("Social Media Management");
    expect(html).toContain("[numbers]");
    expect(html).toContain("[chatbots]");
    for (const legacy of ["[work]", "[campaigns]", "[accounts]", "[updates]"]) expect(html).toContain(legacy);
    expect(NumbersSection).toHaveBeenLastCalledWith({ businessId: BUSINESS, notice: null, scope: "ads" }, undefined);
  });

  it("leaves the chatbots out when the website was not bought", async () => {
    vi.mocked(listLiveServiceLines).mockResolvedValue(PAID_ADS);
    vi.mocked(isWebsiteBought).mockResolvedValue(false);
    expect(await open()).not.toContain("[chatbots]");
  });

  it("says it could not load the chatbots, with Try again, when that read fails", async () => {
    vi.mocked(listLiveServiceLines).mockResolvedValue(PAID_ADS);
    vi.mocked(loadClientChatbots).mockRejectedValue(new Error("db down"));
    const html = await open();
    expect(html).toContain("We could not load the chatbots.");
    expect(html).toContain("Try again");
  });

  it("opens the legacy tools only when one of their notices came back", async () => {
    vi.mocked(listLiveServiceLines).mockResolvedValue(PAID_ADS);
    expect(await open({ campaigns: "saved" })).toContain("<details open");
    expect(await open()).not.toContain("<details open");
  });

  it("says it could not load, with Try again, when the read fails", async () => {
    vi.mocked(listLiveServiceLines).mockRejectedValue(new Error("db down"));
    const html = await open();
    expect(html).toContain("We could not load the services.");
    expect(html).toContain("Try again");
  });

  it("stays on the tab for a notice it owns and sends other notices to their tab", async () => {
    expect(await open({ numbers: "saved" })).toContain("No services yet.");
    await expect(open({ addOns: "contacted" })).rejects.toThrow(`redirect:/clients/${BUSINESS}/billing?addOns=contacted`);
    await expect(open({ preview: "sent" })).rejects.toThrow(`redirect:/clients/${BUSINESS}/website?preview=sent`);
  });
});
