export const DEVICES = ["mobile", "tablet", "desktop"] as const;
export type Device = (typeof DEVICES)[number];

/**
 * The kind of device from a user agent string. The string itself is never stored: only this one word. An iPad that asks
 * for the desktop site looks like a Mac and is counted as a desktop; that is a known limit of reading the string.
 */
export function deviceClass(userAgent: string): Device {
  if (/iPad|Tablet|PlayBook|Silk/i.test(userAgent)) return "tablet";
  if (/Android/i.test(userAgent)) return /Mobile/i.test(userAgent) ? "mobile" : "tablet";
  if (/iPhone|iPod|Mobi|Windows Phone/i.test(userAgent)) return "mobile";
  return "desktop";
}
