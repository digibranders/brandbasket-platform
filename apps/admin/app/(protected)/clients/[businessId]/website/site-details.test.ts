import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { isWebsiteBought } from "@/lib/server/bought-services";
import { SiteDetails } from "./site-details";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://app.example.com" }) }));
vi.mock("@/lib/server/site-token", () => ({ getSiteApiToken: vi.fn().mockResolvedValue(null) }));
vi.mock("@/lib/server/bought-services", () => ({ isWebsiteBought: vi.fn() }));
vi.mock("@/lib/brand", () => ({ adminBrand: () => ({ sellsDirectory: false, directoryName: "Directory" }) }));
vi.mock("@/components/client-features", () => ({ ClientFeatures: () => "[features]" }));
vi.mock("@/components/client-listing", () => ({ ClientListing: () => "[listing]" }));
vi.mock("@/components/client-listing-tags", () => ({ ClientListingTags: () => "[listing tags]" }));
vi.mock("../parts", async () => {
  const actual = await vi.importActual<typeof import("../parts")>("../parts");
  return { ...actual, WebsiteUrlBlock: () => "[website url]", HostingBlock: () => "[hosting]", SiteApiTokenBlock: () => "[token]", TrackingBlock: () => "[tracking]" };
});
vi.mock("../actions", () => ({}));
vi.mock("../tracking-actions", () => ({ createSiteKeyAction: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    ...actual,
    countAppointments: vi.fn().mockResolvedValue({}),
    findBusinessTimeZone: vi.fn().mockResolvedValue(null),
    findBusinessWebsiteUrl: vi.fn().mockResolvedValue(null),
    findListingPlacement: vi.fn().mockResolvedValue(null),
    findPlaces: vi.fn().mockResolvedValue(new Map()),
    getSiteKey: vi.fn().mockResolvedValue(null),
    hasLiveProject: vi.fn().mockResolvedValue(false),
    lastSiteHitAt: vi.fn().mockResolvedValue(null),
    listEnabledModules: vi.fn().mockResolvedValue([]),
    listHostedSites: vi.fn().mockResolvedValue([]),
    listUpcomingDirectoryPromotions: vi.fn().mockResolvedValue([]),
    readDirectoryStatuses: vi.fn().mockResolvedValue(new Map()),
  };
});

const CLIENT = { businessId: "01a0f71b-8402-7d48-a90a-207e8c8a882c", businessName: "Om Sweets", profile: null, hours: [], services: [] } as never;

beforeEach(() => {
  vi.mocked(isWebsiteBought).mockResolvedValue(true);
});

describe("Site details", () => {
  it("holds the site data sections that used to be the Website tab", async () => {
    const html = renderToStaticMarkup(await SiteDetails({ client: CLIENT, query: {} }));
    for (const title of ["Their website", "Features", "Business details", "Opening hours", "What they offer"]) expect(html).toContain(title);
    expect(html).not.toContain(">Listing<");
    for (const marker of ["[website url]", "[hosting]", "[token]", "[tracking]", "[features]"]) expect(html).toContain(marker);
  });

  it("leaves the hosting, token and tracking out when the website was not bought", async () => {
    vi.mocked(isWebsiteBought).mockResolvedValue(false);
    const html = renderToStaticMarkup(await SiteDetails({ client: CLIENT, query: {} }));
    expect(html).toContain("[website url]");
    for (const marker of ["[hosting]", "[token]", "[tracking]"]) expect(html).not.toContain(marker);
  });
});
