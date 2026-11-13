import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { SiteHealthCard } from "./site-health-card";

const NOW = new Date("2026-11-03T09:00:00.000Z");
const EMPTY = { latest: null, firstCheckedAt: null, up: 0, down: 0, certificate: null, phoneSpeed: null };
const render = (facts: Parameters<typeof SiteHealthCard>[0]["facts"]): string => renderToStaticMarkup(<SiteHealthCard facts={facts} now={NOW} />).replaceAll("<!-- -->", "");

describe("SiteHealthCard", () => {
  it("says there are no checks yet instead of inventing a state", () => {
    const html = render(EMPTY);
    expect(html).toContain("No checks yet");
    expect(html).not.toContain("Online");
  });

  it("lists uptime, the secure connection and phone speed, with a word beside a warning", () => {
    const html = render({
      latest: { status: "down", checkedAt: new Date(NOW.getTime() - 600_000) },
      firstCheckedAt: new Date(NOW.getTime() - 40 * 86_400_000),
      up: 4319,
      down: 1,
      certificate: { expiresAt: new Date(NOW.getTime() - 86_400_000), checkedAt: NOW },
      phoneSpeed: { score: 82, checkedAt: NOW },
    });
    expect(html).toContain("Your website is down");
    expect(html).toContain("Online 99.9% of the last 30 days");
    expect(html).toContain("Secure connection ended on Mon 2 Nov");
    expect(html).toContain("Ended");
    expect(html).toContain("Speed on phones: 82 out of 100");
  });
});
