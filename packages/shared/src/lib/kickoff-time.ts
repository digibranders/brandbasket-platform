/*
 * How a kickoff time reads in a notice. A notice is written once and read later, so the zone is stated: the calls run on India time.
 */
const ZONE = "Asia/Kolkata";

const clock = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true, timeZone: ZONE });
const day = new Intl.DateTimeFormat("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: ZONE });

/** "2:30 pm IST". */
export function kickoffClockTime(date: Date): string {
  return `${clock.format(date)} IST`;
}

/** "Tue 17 Nov, 2:30 pm IST". */
export function kickoffDayTime(date: Date): string {
  return `${day.format(date).replace(",", "")}, ${kickoffClockTime(date)}`;
}
