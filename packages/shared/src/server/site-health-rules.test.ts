import { describe, expect, it } from "vitest";
import {
  alertTimeWords,
  errorText,
  fetchFailureText,
  inPool,
  pageSpeedRequestUrl,
  parsePageSpeed,
  resultFromHttpStatus,
  siteUrl,
  speedDue,
  startsOutage,
} from "./site-health-rules";

const NOW = new Date("2026-11-03T09:00:00.000Z");
const HOUR = 3_600_000;

describe("site health rules", () => {
  it("checks the home page over https", () => {
    expect(siteUrl("cafe.example.com")).toBe("https://cafe.example.com/");
  });

  it("counts an answer below 400 as up", () => {
    expect(resultFromHttpStatus(200)).toBe("up");
    expect(resultFromHttpStatus(304)).toBe("up");
    expect(resultFromHttpStatus(404)).toBe("down");
    expect(resultFromHttpStatus(503)).toBe("down");
  });

  it("says why a fetch threw", () => {
    expect(fetchFailureText(new DOMException("The operation timed out.", "TimeoutError"))).toBe("Timed out after 10 seconds");
    const dns = Object.assign(new Error("getaddrinfo ENOTFOUND cafe.example.com"), { code: "ENOTFOUND" });
    expect(fetchFailureText(new TypeError("fetch failed", { cause: dns }))).toBe("Could not connect (ENOTFOUND)");
    expect(fetchFailureText(new Error("odd"))).toBe("odd");
  });

  it("joins the failures, skips the empty ones and keeps each short", () => {
    expect(errorText([null, ""])).toBeNull();
    expect(errorText(["a", null, "b"])).toBe("a; b");
    const long = errorText(["x".repeat(500), "Phone speed check failed: quota"]);
    expect(long).toContain("Phone speed check failed");
    expect(long?.length).toBeLessThanOrEqual(1000);
  });

  it("runs the phone speed check at most once a day", () => {
    expect(speedDue(null, NOW)).toBe(true);
    expect(speedDue(new Date(NOW.getTime() - 23 * HOUR), NOW)).toBe(false);
    expect(speedDue(new Date(NOW.getTime() - 24 * HOUR), NOW)).toBe(true);
  });

  it("starts an outage only on the second down after an up", () => {
    expect(startsOutage(["down", "down", "up"])).toBe(true);
    expect(startsOutage(["down", "up", "up"])).toBe(false);
    expect(startsOutage(["down", "down", "down"])).toBe(false);
    expect(startsOutage(["down", "down"])).toBe(false);
    expect(startsOutage(["up", "down", "down"])).toBe(false);
  });

  it("asks PageSpeed for the phone strategy, with the key only when there is one", () => {
    const withKey = new URL(pageSpeedRequestUrl("https://cafe.example.com/", "k1"));
    expect(withKey.pathname).toBe("/pagespeedonline/v5/runPagespeed");
    expect(withKey.searchParams.get("url")).toBe("https://cafe.example.com/");
    expect(withKey.searchParams.get("strategy")).toBe("mobile");
    expect(withKey.searchParams.get("key")).toBe("k1");
    expect(new URL(pageSpeedRequestUrl("https://cafe.example.com/", null)).searchParams.has("key")).toBe(false);
  });

  it("reads the score out of 100 and the largest contentful paint", () => {
    const body = { lighthouseResult: { categories: { performance: { score: 0.824 } }, audits: { "largest-contentful-paint": { numericValue: 1834.6 } } } };
    expect(parsePageSpeed(body)).toEqual({ score: 82, lcpMs: 1835 });
    expect(() => parsePageSpeed({ error: { code: 429 } })).toThrow(/performance score/);
  });

  it("writes alert times in India's time", () => {
    expect(alertTimeWords(new Date("2026-11-03T08:50:00.000Z"))).toBe("3 November 2026, 14:20 IST");
  });

  it("never runs more than the limit at once and keeps the order", async () => {
    let running = 0;
    let most = 0;
    const results = await inPool([1, 2, 3, 4, 5, 6, 7], 4, async (n) => {
      running += 1;
      most = Math.max(most, running);
      await new Promise((resolve) => setTimeout(resolve, 5));
      running -= 1;
      return n * 2;
    });
    expect(results).toEqual([2, 4, 6, 8, 10, 12, 14]);
    expect(most).toBe(4);
    expect(await inPool([], 4, async () => 1)).toEqual([]);
  });
});
