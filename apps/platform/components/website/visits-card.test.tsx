import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { VisitsData } from "@/lib/server/site-visits";
import { VisitsCard } from "./visits-card";

vi.mock("server-only", () => ({}));

const NOW = new Date("2026-11-03T08:00:00.000Z");
const UPDATED = new Date("2026-11-03T00:30:00.000Z");
const render = (visits: VisitsData): string => renderToStaticMarkup(<VisitsCard visits={visits} now={NOW} />).replaceAll("<!-- -->", "");

describe("VisitsCard", () => {
  it("shows the total, the change and, for Google Analytics, where it came from", () => {
    const html = render({
      summary: { source: "ga4", total: 360, change: -8, period: "Last 30 days", days: [], updatedAt: UPDATED },
      lists: {
        month: "2026-11-01",
        pages: [{ label: "/book", value: 20 }],
        channels: [{ label: "Search engines", value: 40 }],
        updatedAt: UPDATED,
      },
    });
    expect(html).toContain("360");
    expect(html).toContain("-8%");
    expect(html).toContain("Last 30 days. From Google Analytics");
    expect(html).toContain("November so far. Updated Tue 3 Nov. From Google Analytics");
    expect(html).toContain("/book");
    expect(html).toContain("Search engines");
  });

  it("shows no change and no lists when there are none, never a zero", () => {
    const html = render({ summary: { source: "own", total: 35, change: null, period: "Since Thu 29 Oct", days: [], updatedAt: UPDATED }, lists: null });
    expect(html).toContain("Since Thu 29 Oct");
    expect(html).not.toContain("before");
    expect(html).not.toContain("Most visited pages");
  });
});
