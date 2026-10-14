import { addWeeks, type StaffAd } from "@firstfold/db";

/*
 * Staff book an ad for weeks in a row and the database keeps one row a week; the Ads page lists the booking as one
 * line, "14 Oct – 7 Dec · 8 weeks", and takes it down as one. Pure, so it is tested without a database.
 */

/** One booking: the same ad on the same spot in consecutive weeks. */
export interface StaffAdRun {
  /** The first week's ad: what the run shows, where, and for how much. */
  readonly ad: StaffAd;
  readonly firstWeek: string;
  readonly lastWeek: string;
  readonly weeks: number;
  /** Every week's ad id, soonest first: what taking the run down removes. */
  readonly ids: readonly string[];
}

/** What makes two weeks' ads the same booking: the same ad text and target, on the same spot in the same market. */
function runKey(ad: StaffAd): string {
  return [
    ad.listingKey ?? "",
    ad.linkUrl ?? "",
    ad.pictureId ?? "",
    ad.businessName,
    ad.tagline ?? "",
    ad.categorySlug,
    ad.citySlug,
    ad.areaSlug,
    ad.placement,
    String(ad.spot),
    String(ad.agreedPaise ?? ""),
    ad.note ?? "",
  ].join("\u0000");
}

/** The ads (any order) as bookings, soonest first: consecutive weeks of the same ad are one run, a gap starts another. */
export function groupStaffAdRuns(ads: readonly StaffAd[]): StaffAdRun[] {
  const sorted = [...ads].sort((a, b) => a.weekStart.localeCompare(b.weekStart) || a.id.localeCompare(b.id));
  const open = new Map<string, { ad: StaffAd; lastWeek: string; ids: string[] }>();
  const runs: StaffAdRun[] = [];
  const close = (key: string): void => {
    const run = open.get(key);
    if (run === undefined) return;
    open.delete(key);
    runs.push({ ad: run.ad, firstWeek: run.ad.weekStart, lastWeek: run.lastWeek, weeks: run.ids.length, ids: run.ids });
  };
  for (const ad of sorted) {
    const key = `${runKey(ad)}\u0000${String(ad.spot)}`;
    const current = open.get(key);
    if (current !== undefined && addWeeks(current.lastWeek, 1) === ad.weekStart) {
      current.lastWeek = ad.weekStart;
      current.ids.push(ad.id);
      continue;
    }
    close(key);
    open.set(key, { ad, lastWeek: ad.weekStart, ids: [ad.id] });
  }
  for (const key of [...open.keys()]) close(key);
  return runs.sort((a, b) => a.firstWeek.localeCompare(b.firstWeek) || a.ad.id.localeCompare(b.ad.id));
}

const rangeDay = new Intl.DateTimeFormat("en-GB", { day: "numeric", month: "short", timeZone: "UTC" });
const DAY_MS = 24 * 60 * 60 * 1000;

/** "14 Oct – 7 Dec": from the first week's Monday to the last week's Sunday. */
export function formatRunRange(firstWeek: string, lastWeek: string): string {
  const start = Date.parse(`${firstWeek}T00:00:00.000Z`);
  const end = Date.parse(`${lastWeek}T00:00:00.000Z`) + 6 * DAY_MS;
  if (Number.isNaN(start) || Number.isNaN(end)) throw new RangeError(`"${firstWeek}" and "${lastWeek}" must be dates`);
  return `${rangeDay.format(start)} – ${rangeDay.format(end)}`;
}
