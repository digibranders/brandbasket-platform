import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffRole } from "@brandbasket/db";
import { loadClientAddOns } from "@/lib/server/add-ons-admin";
import { isWebsiteBought } from "@/lib/server/bought-services";
import { loadClientChatbots } from "@/lib/server/chatbots-admin";
import { openClientTab } from "@/lib/server/client-page";
import ClientPlanAndBillingPage from "./page";
import { BillingSection } from "./billing-section";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/db", () => ({ getStaffDb: () => ({ name: "staff-db" }) }));
vi.mock("@/lib/server/env", () => ({ serverEnv: () => ({ APP_ORIGIN: "https://console.example.com" }) }));
vi.mock("@/lib/server/client-page", () => ({ openClientTab: vi.fn() }));
vi.mock("@/lib/server/add-ons-admin", () => ({ loadClientAddOns: vi.fn() }));
vi.mock("@/lib/server/chatbots-admin", () => ({ loadClientChatbots: vi.fn() }));
vi.mock("@/lib/server/bought-services", () => ({ isWebsiteBought: vi.fn() }));
vi.mock("@/components/client-add-ons", () => ({ ClientAddOns: () => "[add-ons]" }));
vi.mock("@/components/client-chatbots", () => ({ ClientChatbots: () => "[chatbots]" }));
vi.mock("@/components/console/work-section", () => ({ WorkSection: () => "[work]" }));
vi.mock("@/components/console/numbers-section", () => ({ NumbersSection: () => "[numbers]" }));
vi.mock("@/components/console/updates-section", () => ({ UpdatesSection: () => "[updates]" }));
vi.mock("./billing-section", () => ({ BillingSection: vi.fn(() => "[billing section]") }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const PACKAGE = { marker: "package-facts" };

async function render(role: StaffRole, options: { readonly bought?: boolean; readonly search?: Record<string, string> } = {}): Promise<string> {
  vi.mocked(openClientTab).mockResolvedValue({ granted: { user: { id: "staff-1" }, staff: { role } }, client: { businessId: BUSINESS } } as never);
  vi.mocked(isWebsiteBought).mockResolvedValue(options.bought ?? true);
  const element = await ClientPlanAndBillingPage({ params: Promise.resolve({ businessId: BUSINESS }), searchParams: Promise.resolve(options.search ?? {}) });
  return renderToStaticMarkup(element);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadClientAddOns).mockResolvedValue({ addOns: [], bundledAddOns: [], pressReleases: [], options: [], package: PACKAGE, keptStartsOn: null } as never);
  vi.mocked(loadClientChatbots).mockResolvedValue([]);
});

describe("the Plan and billing tab", () => {
  it("opens as the billing tab for every role", async () => {
    for (const role of ["support", "finance", "admin"] as const) {
      await render(role);
      expect(openClientTab).toHaveBeenLastCalledWith(BUSINESS, "billing");
    }
  });

  it("shows what they buy first for every role", async () => {
    for (const role of ["support", "finance", "admin"] as const) {
      const html = await render(role);
      expect(html, role).toContain("[work]");
      expect(html, role).toContain("[numbers]");
      expect(html, role).toContain("[updates]");
      expect(html, role).toContain("[add-ons]");
      expect(html, role).toContain("[chatbots]");
    }
  });

  it("leaves the chatbots out when the website was not bought", async () => {
    expect(await render("finance", { bought: false })).not.toContain("[chatbots]");
  });

  it("puts the billing section after the services for roles with money", async () => {
    for (const role of ["finance", "admin"] as const) {
      const html = await render(role);
      expect(html.indexOf("[billing section]"), role).toBeGreaterThan(html.indexOf("[chatbots]"));
    }
  });

  it("hands the billing section the client, the query and the package it already loaded", async () => {
    await render("finance", { search: { payment: "recorded" } });
    expect(BillingSection).toHaveBeenLastCalledWith(
      { client: { businessId: BUSINESS }, query: { payment: "recorded" }, packageFacts: PACKAGE },
      undefined,
    );
  });

  it("does not render the billing section for support, so none of its data is read", async () => {
    const html = await render("support");
    expect(html).not.toContain("[billing section]");
    expect(BillingSection).not.toHaveBeenCalled();
  });
});
