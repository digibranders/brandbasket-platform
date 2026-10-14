import "server-only";
import { isIP } from "node:net";

/** The 8 colon-separated groups of a full IPv6 address, expanding a "::" run of zeros if present. Not a full
 * validator: only called once `node:net`'s `isIP` has already confirmed the string is an IPv6 address. */
function expandIPv6Groups(address: string): readonly string[] {
  const withoutZone = address.split("%")[0] ?? address;
  if (!withoutZone.includes("::")) return withoutZone.split(":");

  const [head = "", tail = ""] = withoutZone.split("::");
  const headGroups = head === "" ? [] : head.split(":");
  const tailGroups = tail === "" ? [] : tail.split(":");
  const zeroGroups = Array.from({ length: Math.max(8 - headGroups.length - tailGroups.length, 0) }, () => "0");
  return [...headGroups, ...zeroGroups, ...tailGroups];
}

/** An IPv4-mapped IPv6 address, e.g. "::ffff:203.0.113.9" (any case): really just an IPv4 address, so it must key
 * the same as one, not collapse to the same all-zeros /64 as every other IPv4-mapped visitor. Only the
 * dotted-decimal spelling: split on ":", its trailing token is the dotted quad itself rather than a plain hex
 * group, so this pattern is matched directly against the original string instead of through `expandIPv6Groups`. */
const IPV4_MAPPED_PATTERN = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/;

/** Drops a group's leading zeros (Postgres, `dig` and friends all print "db8", never "0db8"), keeping at least
 * one digit so an all-zero group reads as "0" rather than disappearing. */
function stripLeadingZeros(group: string): string {
  const stripped = group.replace(/^0+/, "");
  return stripped === "" ? "0" : stripped;
}

function isZeroGroup(group: string): boolean {
  return /^0+$/.test(group);
}

/**
 * The IPv4 address of an IPv4-mapped IPv6 address written in its *hex* form, e.g. "::ffff:cb00:7109" (the last 32
 * bits as two hex groups rather than a dotted quad -- some proxies and logging libraries emit this spelling), or
 * null when `groups` isn't one. RFC 4291 §2.5.5.2 defines the mapped prefix as 80 zero bits then 16 one bits
 * ("ffff"); `groups` must already be the fully expanded 8 groups (see `expandIPv6Groups`).
 */
function ipv4FromMappedHexGroups(groups: readonly string[]): string | null {
  if (groups.length !== 8 || !groups.slice(0, 5).every(isZeroGroup)) return null;
  if (stripLeadingZeros(groups[5] ?? "") !== "ffff") return null;
  const hi = Number.parseInt(groups[6] ?? "", 16);
  const lo = Number.parseInt(groups[7] ?? "", 16);
  if (!Number.isInteger(hi) || !Number.isInteger(lo)) return null;
  return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff].join(".");
}

/**
 * The rate-limit key for a visitor's address: an IPv4 address as given; the IPv4 part of an IPv4-mapped IPv6
 * address (dotted or hex form); or, for any other IPv6 address, its first four groups (its /64, the block an ISP
 * typically hands one customer) — lower-cased and with each group's leading zeros stripped, so "2001:DB8::1" and
 * "2001:0db8::1" collapse to the same key rather than opening two separate budgets for the same visitor. Anything
 * `isIP` doesn't recognize is used as-is, rather than thrown away: better to rate-limit on a strange value than
 * not at all.
 */
export function ipRateLimitKey(clientIp: string): string {
  const version = isIP(clientIp);
  if (version === 4) return clientIp;
  if (version === 6) {
    const lower = clientIp.toLowerCase();
    const mapped = IPV4_MAPPED_PATTERN.exec(lower);
    if (mapped?.[1] !== undefined) return mapped[1];
    const groups = expandIPv6Groups(lower);
    const hexMapped = ipv4FromMappedHexGroups(groups);
    if (hexMapped !== null) return hexMapped;
    return groups.slice(0, 4).map(stripLeadingZeros).join(":");
  }
  return clientIp;
}
