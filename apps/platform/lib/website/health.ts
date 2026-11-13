import type { SiteHealthFacts } from "@brandbasket/db";
import type { StatusTone } from "@/components/home/status-word";
import { formatDate, formatNumber, formatPercent, formatRelative } from "@/lib/website/format";

/*
 * Site health: the rows of the Website page's panel, from the stored checks only. Nothing is shown that a check did not measure.
 */

export const UPTIME_WINDOW_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;
/** The uptime figure needs a full day of checks; before that it would swing on a single failure. */
const UPTIME_MIN_MS = DAY_MS;
const CERTIFICATE_WARN_DAYS = 14;

/** The start of the uptime window. */
export function uptimeSince(now: Date): Date {
  return new Date(now.getTime() - UPTIME_WINDOW_DAYS * DAY_MS);
}

/** Share of up results, rounded down to one decimal so a site with any downtime never reads 100%. Null without results. */
export function uptimePercent(up: number, down: number): number | null {
  const total = up + down;
  return total === 0 ? null : Math.floor((up / total) * 1000) / 10;
}

/** "Online 99.9% of the last 30 days" once a day of checks exists, "Checking since Tue 3 Nov" before, or null. */
function uptimeTitle(facts: SiteHealthFacts, now: Date): string | null {
  if (facts.firstCheckedAt === null) return null;
  if (now.getTime() - facts.firstCheckedAt.getTime() < UPTIME_MIN_MS) return `Checking since ${formatDate(facts.firstCheckedAt, now)}`;
  const percent = uptimePercent(facts.up, facts.down);
  return percent === null ? null : `Online ${formatPercent(percent)} of the last ${formatNumber(UPTIME_WINDOW_DAYS)} days`;
}

export interface HealthRow {
  readonly key: "status" | "uptime" | "certificate" | "speed";
  readonly title: string;
  readonly line: string | null;
  readonly badge: { readonly tone: StatusTone; readonly text: string } | null;
}

/** The panel's rows, in the order a person asks: is it up, how reliably, is it secure, is it fast. Empty before any check. */
export function siteHealthRows(facts: SiteHealthFacts, now: Date): HealthRow[] {
  const rows: HealthRow[] = [];
  if (facts.latest !== null) {
    const up = facts.latest.status === "up";
    rows.push({
      key: "status",
      title: up ? "Your website is up" : "Your website is down",
      line: `Last check: ${formatRelative(facts.latest.checkedAt, now)}`,
      badge: up ? { tone: "ok", text: "Up" } : { tone: "warn", text: "Down" },
    });
  }
  const uptime = uptimeTitle(facts, now);
  if (uptime !== null) rows.push({ key: "uptime", title: uptime, line: null, badge: null });
  if (facts.certificate !== null) {
    const { expiresAt } = facts.certificate;
    const left = expiresAt.getTime() - now.getTime();
    const ended = left <= 0;
    rows.push({
      key: "certificate",
      title: ended ? `Secure connection ended on ${formatDate(expiresAt, now)}` : `Secure connection valid until ${formatDate(expiresAt, now)}`,
      line: null,
      badge: ended ? { tone: "warn", text: "Ended" } : left < CERTIFICATE_WARN_DAYS * DAY_MS ? { tone: "warn", text: "Ends soon" } : null,
    });
  }
  if (facts.phoneSpeed !== null) {
    rows.push({
      key: "speed",
      title: `Speed on phones: ${formatNumber(facts.phoneSpeed.score)} out of 100`,
      line: `Checked ${formatDate(facts.phoneSpeed.checkedAt, now)}`,
      badge: null,
    });
  }
  return rows;
}
