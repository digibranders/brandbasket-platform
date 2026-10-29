import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getLiveWebsite } from "@/lib/server/onboarding";
import WebsitePagesPage from "./page";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/customer-access", () => ({ requireWebsiteClient: vi.fn(async () => ({})) }));
vi.mock("@/lib/server/onboarding", () => ({ getLiveWebsite: vi.fn() }));

async function render(): Promise<string> {
  return renderToStaticMarkup(await WebsitePagesPage()).replaceAll("<!-- -->", "");
}

beforeEach(() => {
  vi.resetAllMocks();
});

describe("the Pages tab", () => {
  it("links the live website and asks which page to change, without inventing a list of pages", async () => {
    vi.mocked(getLiveWebsite).mockResolvedValue({ hostname: "sharmadental.in" } as never);
    const html = await render();
    expect(html).toMatch(/href="https:\/\/sharmadental.in\/?"/);
    expect(html).toContain("sharmadental.in");
    expect(html).toContain("tell us which one and what to change");
    expect(html).toContain('href="/requests/new?kind=website&amp;page="');
    for (const invented of ["About", "Services", "Contact"]) expect(html).not.toContain(`>${invented}<`);
  });

  it("says the website is not live yet instead of showing a link", async () => {
    vi.mocked(getLiveWebsite).mockResolvedValue(null);
    const html = await render();
    expect(html).toContain("Not live yet");
    expect(html).not.toContain("noopener");
  });

  it("keeps the two rows that point inside the dashboard, and never uses a dash", async () => {
    vi.mocked(getLiveWebsite).mockResolvedValue(null);
    const html = await render();
    expect(html).toContain('href="/details"');
    expect(html).toContain('href="/content/blog"');
    expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/[–—]/);
  });
});
