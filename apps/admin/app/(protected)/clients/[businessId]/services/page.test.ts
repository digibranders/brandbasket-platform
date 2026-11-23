import { listAddOnsToContact, listLiveServiceLines } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { openClientTab } from "@/lib/server/client-page";
import ClientServicesPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
  useRouter: () => ({ refresh: vi.fn() }),
}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/client-page", () => ({ openClientTab: vi.fn() }));
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

async function open(query: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(await ClientServicesPage({ params: Promise.resolve({ businessId: BUSINESS }), searchParams: Promise.resolve(query) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(openClientTab).mockResolvedValue({ granted: { staff: { role: "admin" } }, client: CLIENT } as never);
  vi.mocked(listLiveServiceLines).mockResolvedValue([]);
  vi.mocked(listAddOnsToContact).mockResolvedValue([]);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("the Services tab", () => {
  it("is an empty state before they have any service", async () => {
    expect(await open()).toContain("No services yet.");
  });

  it("lists each service and where it is run", async () => {
    vi.mocked(listLiveServiceLines).mockResolvedValue([{ businessId: BUSINESS, addOn: "paid-ads", netAmountCents: 1, status: "active" }]);
    const html = await open();
    expect(html).toContain("Paid Ads Management");
    expect(html).toContain(`href="/clients/${BUSINESS}/billing#numbers"`);
  });

  it("says it could not load, with Try again, when the read fails", async () => {
    vi.mocked(listLiveServiceLines).mockRejectedValue(new Error("db down"));
    const html = await open();
    expect(html).toContain("We could not load the services.");
    expect(html).toContain("Try again");
  });

  it("sends an old /services link that carries a notice to the tab that shows it", async () => {
    await expect(open({ addOns: "contacted" })).rejects.toThrow(`redirect:/clients/${BUSINESS}/billing?addOns=contacted`);
    await expect(open({ preview: "sent" })).rejects.toThrow(`redirect:/clients/${BUSINESS}/website?preview=sent`);
  });
});
