import type { SiteHealthFacts } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { homeHealthLine, siteHealthRows, uptimePercent, uptimeSince } from "./health";

const NOW = new Date("2026-11-03T09:00:00.000Z");
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const ago = (ms: number): Date => new Date(NOW.getTime() - ms);
const EMPTY: SiteHealthFacts = { latest: null, firstCheckedAt: null, up: 0, down: 0, certificate: null, phoneSpeed: null };

describe("uptimePercent", () => {
  it("rounds down so any downtime never reads 100%", () => {
    expect(uptimePercent(0, 0)).toBeNull();
    expect(uptimePercent(10, 0)).toBe(100);
    expect(uptimePercent(4319, 1)).toBe(99.9);
    expect(uptimePercent(1, 1)).toBe(50);
  });

  it("looks back 30 days", () => {
    expect(uptimeSince(NOW)).toEqual(ago(30 * DAY));
  });
});

describe("siteHealthRows", () => {
  it("has no rows before the first check, so the panel shows its empty state", () => {
    expect(siteHealthRows(EMPTY, NOW)).toEqual([]);
    expect(homeHealthLine(EMPTY, NOW)).toBeNull();
  });

  it("says checking since the first check until a day of checks exists", () => {
    const facts: SiteHealthFacts = { ...EMPTY, latest: { status: "up", checkedAt: ago(5 * 60_000) }, firstCheckedAt: ago(3 * HOUR), up: 18 };
    const rows = siteHealthRows(facts, NOW);
    expect(rows.map((row) => row.title)).toEqual(["Your website is up", "Checking since Tue 3 Nov"]);
    expect(rows[0]).toMatchObject({ line: "Last check: Today, 14:25", badge: { tone: "pos", text: "Up" } });
    expect(homeHealthLine(facts, NOW)).toBe("Up now. Last check: Today, 14:25. Checking since Tue 3 Nov.");
  });

  it("shows the uptime, the certificate and the phone speed once measured", () => {
    const facts: SiteHealthFacts = {
      latest: { status: "down", checkedAt: ago(10 * 60_000) },
      firstCheckedAt: ago(40 * DAY),
      up: 4319,
      down: 1,
      certificate: { expiresAt: new Date("2027-02-04T00:00:00.000Z"), checkedAt: ago(10 * 60_000) },
      phoneSpeed: { score: 82, checkedAt: ago(DAY) },
    };
    const rows = siteHealthRows(facts, NOW);
    expect(rows.map((row) => row.title)).toEqual([
      "Your website is down",
      "Online 99.9% of the last 30 days",
      "Secure connection valid until Thu 4 Feb 2027",
      "Speed on phones: 82 out of 100",
    ]);
    expect(rows[0]?.badge).toEqual({ tone: "neg", text: "Down" });
    expect(rows[2]?.badge).toBeNull();
    expect(rows[3]?.line).toBe("Checked Mon 2 Nov");
    expect(homeHealthLine(facts, NOW)).toBe("Down now. Last check: Today, 14:20. Online 99.9% of the last 30 days.");
  });

  it("warns when the secure connection ends within 14 days, and says when it has ended", () => {
    const soon = siteHealthRows({ ...EMPTY, certificate: { expiresAt: new Date(NOW.getTime() + 13 * DAY), checkedAt: NOW } }, NOW);
    expect(soon[0]).toMatchObject({ title: "Secure connection valid until Mon 16 Nov", badge: { tone: "warn", text: "Ends soon" } });
    const ended = siteHealthRows({ ...EMPTY, certificate: { expiresAt: ago(DAY), checkedAt: NOW } }, NOW);
    expect(ended[0]).toMatchObject({ title: "Secure connection ended on Mon 2 Nov", badge: { tone: "neg", text: "Ended" } });
  });
});
