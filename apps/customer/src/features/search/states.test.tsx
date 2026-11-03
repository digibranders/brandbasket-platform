import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadSetupAsks } from "@/features/setup/loader";
import { loadReportLink } from "@/features/social/loader";
import type { CustomerContext } from "@/lib/guards";
import { SearchScreen } from "./components/search-screen";
import { loadSearchNumbers, loadSearchWork } from "./loader";
import { pageOne } from "./rules";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("./loader", () => ({ loadSearchNumbers: vi.fn(), loadSearchWork: vi.fn() }));
vi.mock("@/features/social/loader", () => ({ loadReportLink: vi.fn() }));
vi.mock("@/features/setup/loader", () => ({ loadSetupAsks: vi.fn(), loadNotBought: vi.fn() }));

const NOW = new Date("2026-11-24T06:00:00.000Z");
const NOISE = /No data|undefined|\bnull\b|NaN/;
const down = new Error("connection refused");
const customer = { role: "owner", services: ["search"], businessId: "b1", tenant: {} } as unknown as CustomerContext;

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadSetupAsks).mockResolvedValue([]);
  vi.mocked(loadReportLink).mockResolvedValue(null);
  vi.mocked(loadSearchWork).mockResolvedValue({ items: [], month: "November" });
  vi.mocked(loadSearchNumbers).mockResolvedValue({ pageOne: pageOne({ keywordsPageOne: 9, keywordsPageOnePrev: 6, updatedAt: NOW }), month: "November" });
});

describe("Local SEO + AEO: one failed panel", () => {
  it.each([
    { panel: "numbers", what: "your monthly numbers", heading: "Searches on Google's first page", set: () => vi.mocked(loadSearchNumbers).mockRejectedValue(down) },
    { panel: "work", what: "the work we finished", heading: "What we did this month", set: () => vi.mocked(loadSearchWork).mockRejectedValue(down) },
    { panel: "setup", what: "what we need from you", heading: "What we need from you", set: () => vi.mocked(loadSetupAsks).mockRejectedValue(down) },
  ])("$panel failed shows its own error and leaves the page standing", async ({ what, heading, set }) => {
    set();
    render(await SearchScreen({ customer, now: NOW }));
    expect(screen.getByText(`We could not load ${what}.`)).toBeTruthy();
    expect(screen.getByRole("heading", { name: heading })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Local SEO + AEO", level: 1 })).toBeTruthy();
    expect(screen.getAllByRole("alert")).toHaveLength(1);
  });
});

describe("Local SEO + AEO: ok but empty", () => {
  it("says why there is no count and nothing finished, with what will appear", async () => {
    vi.mocked(loadSearchNumbers).mockResolvedValue({ pageOne: null, month: "November" });
    const { container } = render(await SearchScreen({ customer, now: NOW }));
    expect(screen.getByText("No count yet")).toBeTruthy();
    expect(screen.getByText("We count these once a month and add the figure here.")).toBeTruthy();
    expect(screen.getByText("Nothing is finished yet this month.")).toBeTruthy();
    expect(screen.getByText(/appears here once it is done/)).toBeTruthy();
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.textContent).not.toMatch(NOISE);
  });
});
