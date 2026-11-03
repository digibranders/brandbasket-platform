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
const customer = (role: "owner" | "viewer" = "owner"): CustomerContext => ({ role, services: ["search"], businessId: "b1", tenant: {} }) as unknown as CustomerContext;
const CHECKED = new Date("2026-11-23T05:00:00.000Z");

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadSetupAsks).mockResolvedValue([]);
  vi.mocked(loadReportLink).mockResolvedValue(null);
  vi.mocked(loadSearchWork).mockResolvedValue({ items: [], month: "November" });
  vi.mocked(loadSearchNumbers).mockResolvedValue({ pageOne: null, month: "November" });
});

describe("Local SEO + AEO", () => {
  it("is titled by the service, explains AEO once, and shows no tabs for data we do not have", async () => {
    render(await SearchScreen({ customer: customer(), now: NOW }));
    expect(screen.getByRole("heading", { name: "Local SEO + AEO", level: 1 })).toBeTruthy();
    expect(screen.getAllByText(/AEO stands for answer engine optimisation/)).toHaveLength(1);
    for (const hidden of ["Rankings", "AI answers", "Reviews", "Google profile"]) expect(screen.queryByRole("link", { name: hidden })).toBeNull();
    expect(screen.queryByText(/score/i)).toBeNull();
  });

  it("says there is no count yet rather than showing 0, and says what will appear for the work", async () => {
    render(await SearchScreen({ customer: customer(), now: NOW }));
    expect(screen.getByText("No count yet")).toBeTruthy();
    expect(screen.getByText("Nothing is finished yet this month.")).toBeTruthy();
    expect(screen.queryByText("Last check", { exact: false })).toBeNull();
  });

  it("shows the count with its change and the date it was checked", async () => {
    vi.mocked(loadSearchNumbers).mockResolvedValue({ pageOne: pageOne({ keywordsPageOne: 9, keywordsPageOnePrev: 6, updatedAt: CHECKED }), month: "November" });
    render(await SearchScreen({ customer: customer(), now: NOW }));
    expect(screen.getByText("Searches on Google's first page")).toBeTruthy();
    expect(screen.getByText("9")).toBeTruthy();
    expect(screen.getByText("+3")).toBeTruthy();
    expect(screen.getByText(/November\. Up from 6\. Updated Mon 23 Nov/)).toBeTruthy();
    expect(screen.getByText(/Last check Mon 23 Nov\./)).toBeTruthy();
  });

  it("lists what we did, linking only https addresses", async () => {
    vi.mocked(loadSearchWork).mockResolvedValue({
      month: "November",
      items: [
        { id: "a", kind: "page", title: "Tests and packages", dueOn: "2026-11-20", href: "https://apex.in/tests" },
        { id: "b", kind: "listing", title: "Fixed address on Justdial", dueOn: "2026-11-12", href: null },
      ],
    });
    render(await SearchScreen({ customer: customer(), now: NOW }));
    expect(screen.getByRole("heading", { name: "What we did in November" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Tests and packages" }).getAttribute("href")).toBe("https://apex.in/tests");
    expect(screen.queryByRole("link", { name: "Fixed address on Justdial" })).toBeNull();
    expect(screen.getByText("Listing fixed")).toBeTruthy();
  });

  it("shows an error for each failed read, never the empty states that would hide it", async () => {
    vi.mocked(loadSearchNumbers).mockRejectedValue(new Error("down"));
    vi.mocked(loadSearchWork).mockRejectedValue(new Error("down"));
    render(await SearchScreen({ customer: customer(), now: NOW }));
    expect(screen.getByText("We could not load your monthly numbers.")).toBeTruthy();
    expect(screen.getByText("We could not load the work we finished.")).toBeTruthy();
    expect(screen.queryByText("No count yet")).toBeNull();
    expect(screen.queryByText("Nothing is finished yet this month.")).toBeNull();
  });

  it("gives a viewer no Ask for a change, and shows the report link when staff added one", async () => {
    vi.mocked(loadReportLink).mockResolvedValue("https://example.com/r");
    render(await SearchScreen({ customer: customer("viewer"), now: NOW }));
    expect(screen.queryByRole("link", { name: "Ask for a change" })).toBeNull();
    expect(screen.getByRole("link", { name: "Monthly report" }).getAttribute("href")).toBe("https://example.com/r");
  });
});
