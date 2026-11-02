import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLiveWebsite } from "@/lib/server/onboarding";
import { WebsiteFrame } from "./website-frame";

vi.mock("server-only", () => ({}));
vi.mock("@/components/v2/section-tabs", () => ({
  SectionTabs: ({ tabs }: { readonly tabs: readonly { readonly label: string }[] }) => <nav aria-label="Website">{tabs.map((tab) => tab.label).join(",")}</nav>,
}));
vi.mock("@/lib/server/website-address", () => ({ getWebsiteAddress: vi.fn(async () => "www.example.com") }));
vi.mock("@/lib/server/onboarding", () => ({ getLiveWebsite: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
});

const render = async (): Promise<string> => renderToStaticMarkup(await WebsiteFrame({ children: <p>Inside</p> })).replaceAll("<!-- -->", "");

describe("WebsiteFrame", () => {
  it("shows Overview and Enquiries once the website is live", async () => {
    vi.mocked(getLiveWebsite).mockResolvedValue({ hostname: "www.example.com", launchedAt: null });
    const html = await render();
    expect(html).toContain("Overview,Enquiries");
    expect(html).toContain("Inside");
  });

  it("shows no tabs before launch, only the title and the address", async () => {
    vi.mocked(getLiveWebsite).mockResolvedValue(null);
    const html = await render();
    expect(html).not.toContain("Overview");
    expect(html).not.toContain("Enquiries");
    expect(html).not.toContain("Pages");
    expect(html).toContain("<h1");
    expect(html).toContain("Inside");
  });
});
