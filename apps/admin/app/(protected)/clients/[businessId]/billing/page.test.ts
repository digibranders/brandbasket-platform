import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { StaffRole } from "@brandbasket/db";
import { loadClientAddOns } from "@/lib/server/add-ons-admin";
import { openClientTab } from "@/lib/server/client-page";
import ClientMoneyPage from "./page";
import { BillingSection } from "./billing-section";

vi.mock("server-only", () => ({}));
vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));
vi.mock("@/lib/server/client-page", () => ({ openClientTab: vi.fn() }));
vi.mock("@/lib/server/add-ons-admin", () => ({ loadClientAddOns: vi.fn() }));
vi.mock("@/components/client-add-ons", () => ({ ClientAddOns: () => "[add-ons]" }));
vi.mock("./billing-section", () => ({ BillingSection: vi.fn(({ afterPayments }: { afterPayments: unknown }) => ["[billing section]", afterPayments]) }));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";

async function render(role: StaffRole, search: Record<string, string> = {}): Promise<string> {
  vi.mocked(openClientTab).mockResolvedValue({ granted: { user: { id: "staff-1" }, staff: { role } }, client: { businessId: BUSINESS } } as never);
  return renderToStaticMarkup(await ClientMoneyPage({ params: Promise.resolve({ businessId: BUSINESS }), searchParams: Promise.resolve(search) }));
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(loadClientAddOns).mockResolvedValue({ addOns: [], bundledAddOns: [], pressReleases: [], options: [], package: { marker: "package-facts" }, keptStartsOn: null } as never);
});

describe("the Money tab", () => {
  it("opens as the billing tab for every role", async () => {
    for (const role of ["support", "finance", "admin"] as const) {
      await render(role);
      expect(openClientTab).toHaveBeenLastCalledWith(BUSINESS, "billing");
    }
  });

  it("holds money only: the plan lines follow the payments and nothing from Services is on it", async () => {
    for (const role of ["finance", "admin"] as const) {
      const html = await render(role);
      expect(html, role).toContain("[billing section]");
      expect(html, role).toContain("[add-ons]");
      for (const gone of ["[work]", "[numbers]", "[campaigns]", "[accounts]", "[updates]", "[chatbots]"]) expect(html, role).not.toContain(gone);
    }
  });

  it("hands the billing section the client and the query, with no package facts", async () => {
    await render("finance", { payment: "recorded" });
    expect(BillingSection).toHaveBeenLastCalledWith(
      expect.objectContaining({ client: { businessId: BUSINESS }, query: { payment: "recorded" }, packageFacts: null }),
      undefined,
    );
  });

  it("shows support the plan lines only, so none of the billing data is read", async () => {
    const html = await render("support");
    expect(html).toContain("[add-ons]");
    expect(html).not.toContain("[billing section]");
    expect(BillingSection).not.toHaveBeenCalled();
  });

  it("sends a figures or chatbot notice that still arrives here to the Services tab", async () => {
    await expect(render("admin", { numbers: "saved" })).rejects.toThrow(`redirect:/clients/${BUSINESS}/services?numbers=saved`);
    await expect(render("admin", { chatbots: "removed" })).rejects.toThrow(`redirect:/clients/${BUSINESS}/services?chatbots=removed`);
  });
});
