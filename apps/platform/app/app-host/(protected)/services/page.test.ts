import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadAddOnsPage } from "@/lib/server/add-ons";
import { listOpenCustomerCharges } from "@/lib/server/charges";
import { requireCustomerAccess } from "@/lib/server/customer-access";
import ServicesPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/customer-access", () => ({ requireCustomerAccess: vi.fn() }));
vi.mock("@/lib/server/add-ons", () => ({ loadAddOnsPage: vi.fn() }));
vi.mock("@/lib/server/charges", () => ({ listOpenCustomerCharges: vi.fn() }));
vi.mock("@/lib/server/request-brand", () => ({ requestBrand: vi.fn(async () => ({ name: "Brandbasket", contactEmail: "support@brandbasket.in" })) }));
vi.mock("@/components/panel/add-ons/add-on-row", () => ({ AddOnRow: ({ addOn }: { addOn: { id: string } }) => `[row ${addOn.id}]` }));
vi.mock("@/components/panel/payment-waiting", () => ({ PaymentWaiting: () => "[waiting]" }));

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(requireCustomerAccess).mockResolvedValue({ tenant: { businessId: "business-1" } } as never);
  vi.mocked(listOpenCustomerCharges).mockResolvedValue([]);
  vi.mocked(loadAddOnsPage).mockResolvedValue({
    addOns: [
      { addOn: "managed-website", kind: "included" },
      { addOn: "digital-growth", kind: "available" },
      { addOn: "local-seo-aeo", kind: "available" },
    ],
  } as never);
});

async function render(searchParams: Record<string, string> = {}): Promise<string> {
  return renderToStaticMarkup(await ServicesPage({ searchParams: Promise.resolve(searchParams) })).replaceAll("<!-- -->", "");
}

describe("the Your plan page", () => {
  it("is titled Your plan, as the rail names it, and lists each service as a row", async () => {
    const html = await render();
    expect(html).toContain(">Your plan</h1>");
    expect(html).not.toContain(">Services</h1>");
    for (const id of ["managed-website", "digital-growth", "local-seo-aeo"]) expect(html).toContain(`[row ${id}]`);
    expect(html).toContain("divide-y divide-line");
  });

  it("sits in the page frame, left-aligned and as wide as the content area", async () => {
    const html = await render();
    expect(html).toContain("@container");
    expect(html).toContain("max-w-[97.5rem]");
    expect(html).not.toContain("mx-auto");
  });

  it("says a problem with a payment, and says nothing for one that went through", async () => {
    expect(await render({ charge: "failed" })).toContain("That payment didn’t go through");
    expect(await render({ charge: "paid" })).not.toContain("Payment received");
  });

  it("waits for a payment being confirmed instead of offering a second Add", async () => {
    vi.mocked(listOpenCustomerCharges).mockResolvedValue([{ kind: "add_on" }] as never);
    expect(await render({ charge: "processing" })).toContain("[waiting]");
  });
});
