import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeRateLimit,
  incrementDirectoryDailyCount,
  purgeOldDirectoryDailyCounts,
  readActiveDirectoryPaidTags,
  readDirectoryShareCounts,
  readDirectorySignals,
  resolveDirectoryAsk,
  resolveDirectoryNamed,
  type Database,
  type DirectoryNamed,
  type DirectoryPaidTag,
  type DirectoryRef,
  type DirectorySignal,
  type ResolvedDirectoryAsk,
} from "@brandbasket/db";
import { signalsResponseSchema } from "@/lib/directory-api";
import { getStaffDb } from "./db";
import { accountCodeSecret } from "./env";
import { directoryDay, readSignals, recordDirectoryEvent, type DirectoryEvent } from "./directory-signals";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getStaffDb: vi.fn() }));
vi.mock("./env", () => ({ accountCodeSecret: vi.fn() }));
vi.mock("@brandbasket/db", async () => {
  const actual = await vi.importActual<typeof import("@brandbasket/db")>("@brandbasket/db");
  return {
    answerByAsked: actual.answerByAsked,
    directoryRefId: actual.directoryRefId,
    consumeRateLimit: vi.fn(),
    incrementDirectoryDailyCount: vi.fn(),
    purgeOldDirectoryDailyCounts: vi.fn(),
    readActiveDirectoryPaidTags: vi.fn(),
    readDirectoryShareCounts: vi.fn(),
    readDirectorySignals: vi.fn(),
    resolveDirectoryAsk: vi.fn(),
    resolveDirectoryNamed: vi.fn(),
  };
});

const DB = {} as Database;
const SECRET = "s".repeat(40);
const KEY = "restaurants/ambarnath/sarvodaya-nagar/golden-punjab-hotel";
const OTHER_KEY = "dentists/thane/naupada/smile-dental";
/** The place OTHER_KEY is a legacy key of. */
const OTHER_ID = "k7m2q9a";
const IP = "203.0.113.9";
/** 10:00 in Asia/Kolkata. */
const NOW = new Date("2026-09-29T04:30:00.000Z");
const ALLOWED = { allowed: true, remaining: 0, retryAfterSeconds: 0 } as const;
const REFUSED = { allowed: false, remaining: 0, retryAfterSeconds: 60 } as const;

/** Each test runs on its own day, so the once-a-day purge in the module under test starts fresh every time. */
let dayOffset = 0;
function freshNow(): Date {
  dayOffset += 1;
  return new Date(NOW.getTime() + dayOffset * 24 * 60 * 60 * 1000);
}

function event(overrides: Partial<DirectoryEvent> = {}): DirectoryEvent {
  return { business: { by: "key", key: KEY }, kind: "view", clientIp: IP, ...overrides };
}

/** OTHER_KEY is a legacy key of OTHER_ID; any other key has no place; any id but "zzzzzz2" exists. */
async function resolveNamed(_db: unknown, named: DirectoryNamed): Promise<DirectoryRef | null> {
  if (named.by === "id") return named.id === "zzzzzz2" ? null : { placeId: named.id, listingKey: null };
  return named.key === OTHER_KEY ? { placeId: OTHER_ID, listingKey: OTHER_KEY } : { placeId: null, listingKey: named.key };
}

/** Each key read under itself: none of them has a place. */
function unplaced(keys: readonly string[]): ResolvedDirectoryAsk {
  return { lookup: { placeIds: [], unplacedKeys: keys }, readAs: new Map(keys.map((key) => [key, key])) };
}

function rateLimitKeys(): string[] {
  return vi.mocked(consumeRateLimit).mock.calls.map((call) => call[1]);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
  vi.mocked(getStaffDb).mockReturnValue(DB);
  vi.mocked(accountCodeSecret).mockReturnValue(SECRET);
  vi.mocked(consumeRateLimit).mockResolvedValue(ALLOWED);
  vi.mocked(incrementDirectoryDailyCount).mockResolvedValue(1);
  vi.mocked(purgeOldDirectoryDailyCounts).mockResolvedValue(0);
  vi.mocked(readDirectoryShareCounts).mockResolvedValue(new Map());
  vi.mocked(resolveDirectoryNamed).mockImplementation(resolveNamed);
});

describe("directoryDay", () => {
  it.each([
    ["2026-09-29T04:30:00.000Z", "2026-09-29"],
    ["2026-09-29T18:29:59.999Z", "2026-09-29"],
    ["2026-09-29T18:30:00.000Z", "2026-09-30"],
    ["2026-12-31T18:30:00.000Z", "2027-01-01"],
    ["2026-09-28T19:00:00.000Z", "2026-09-29"],
  ])("puts %s on the Asia/Kolkata day %s", (instant, day) => {
    expect(directoryDay(new Date(instant))).toBe(day);
  });
});

describe("recordDirectoryEvent", () => {
  it("checks the address ceiling, then once a day, then counts the day's event", async () => {
    const now = freshNow();
    const day = directoryDay(now);
    expect(await recordDirectoryEvent(event(), now)).toBe("counted");

    const calls = vi.mocked(consumeRateLimit).mock.calls;
    expect(calls).toHaveLength(2);
    expect(calls[0]?.[1]).toMatch(/^dir-event:ip:[A-Za-z0-9_-]{43}$/);
    expect(calls[0]?.[2]).toEqual({ limit: 300, windowSeconds: 3600 });
    expect(calls[0]?.[3]).toBe(now);
    expect(calls[1]?.[1]).toMatch(/^dir-event:once:[A-Za-z0-9_-]{43}$/);
    expect(calls[1]?.[2]).toEqual({ limit: 1, windowSeconds: 86_400 });
    // The whole Asia/Kolkata day shares one window.
    expect(calls[1]?.[3]).toEqual(new Date(`${day}T00:00:00.000Z`));
    expect(incrementDirectoryDailyCount).toHaveBeenCalledWith(DB, { business: { placeId: null, listingKey: KEY }, kind: "view", day });
  });

  it("never puts the address itself in a rate-limit key", async () => {
    await recordDirectoryEvent(event({ clientIp: "2001:db8:85a3::8a2e:370:7334" }), freshNow());
    await recordDirectoryEvent(event(), freshNow());
    for (const key of rateLimitKeys()) {
      expect(key).not.toContain(IP);
      expect(key).not.toContain("2001:db8");
    }
  });

  it("keys a visitor once per business, kind and day, and an IPv6 household by its /64", async () => {
    const now = freshNow();
    const onceKey = async (overrides: Partial<DirectoryEvent>, at = now): Promise<string | undefined> => {
      vi.mocked(consumeRateLimit).mockClear();
      await recordDirectoryEvent(event(overrides), at);
      return rateLimitKeys()[1];
    };

    const base = await onceKey({});
    expect(await onceKey({})).toBe(base);
    expect(await onceKey({}, new Date(now.getTime() + 60 * 60 * 1000))).toBe(base);
    expect(await onceKey({ kind: "call" })).not.toBe(base);
    expect(await onceKey({ business: { by: "key", key: OTHER_KEY } })).not.toBe(base);
    // A place is one business whichever address or id the visit came by.
    expect(await onceKey({ business: { by: "key", key: OTHER_KEY } })).toBe(await onceKey({ business: { by: "id", id: OTHER_ID } }));
    expect(await onceKey({ clientIp: "203.0.113.10" })).not.toBe(base);
    expect(await onceKey({}, new Date(now.getTime() + 24 * 60 * 60 * 1000))).not.toBe(base);
    expect(await onceKey({ clientIp: "2001:db8:1:2::1" })).toBe(await onceKey({ clientIp: "2001:db8:1:2:ffff::9" }));
    expect(await onceKey({ clientIp: "::ffff:203.0.113.9" })).toBe(base);
  });

  it("counts a visit to a place by its id, and under its place when it came by one of its keys", async () => {
    const now = freshNow();
    const day = directoryDay(now);
    expect(await recordDirectoryEvent(event({ business: { by: "id", id: OTHER_ID } }), now)).toBe("counted");
    expect(incrementDirectoryDailyCount).toHaveBeenLastCalledWith(DB, { business: { placeId: OTHER_ID, listingKey: null }, kind: "view", day });
    expect(await recordDirectoryEvent(event({ business: { by: "key", key: OTHER_KEY }, kind: "call" }), now)).toBe("counted");
    expect(incrementDirectoryDailyCount).toHaveBeenLastCalledWith(DB, { business: { placeId: OTHER_ID, listingKey: OTHER_KEY }, kind: "call", day });
  });

  it("counts nothing for an id no place has, after the address ceiling", async () => {
    expect(await recordDirectoryEvent(event({ business: { by: "id", id: "zzzzzz2" } }), freshNow())).toBe("unknown_business");
    expect(consumeRateLimit).toHaveBeenCalledTimes(1);
    expect(incrementDirectoryDailyCount).not.toHaveBeenCalled();
  });

  it("does not count a repeat", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce(ALLOWED).mockResolvedValueOnce(REFUSED);
    expect(await recordDirectoryEvent(event(), freshNow())).toBe("repeat");
    expect(incrementDirectoryDailyCount).not.toHaveBeenCalled();
  });

  it("does not count, or spend a once-a-day check, past the address ceiling", async () => {
    vi.mocked(consumeRateLimit).mockResolvedValueOnce(REFUSED);
    expect(await recordDirectoryEvent(event(), freshNow())).toBe("limited");
    expect(consumeRateLimit).toHaveBeenCalledTimes(1);
    expect(incrementDirectoryDailyCount).not.toHaveBeenCalled();
  });

  it("purges old counts once a day, without waiting for it or failing on it", async () => {
    const now = freshNow();
    const today = directoryDay(now);
    vi.mocked(purgeOldDirectoryDailyCounts).mockRejectedValueOnce(new Error("down"));
    expect(await recordDirectoryEvent(event(), now)).toBe("counted");
    // A failed purge is tried again by the next event.
    expect(await recordDirectoryEvent(event(), now)).toBe("counted");
    expect(await recordDirectoryEvent(event(), now)).toBe("counted");
    expect(vi.mocked(purgeOldDirectoryDailyCounts).mock.calls).toEqual([
      [DB, today],
      [DB, today],
    ]);

    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    await recordDirectoryEvent(event(), tomorrow);
    expect(purgeOldDirectoryDailyCounts).toHaveBeenLastCalledWith(DB, directoryDay(tomorrow));
  });

  it("fails without logging the visitor's address", async () => {
    vi.mocked(incrementDirectoryDailyCount).mockRejectedValue(new Error(`insert failed near ${IP}`));
    expect(await recordDirectoryEvent(event(), freshNow())).toBe("failed");
    const logged = JSON.stringify(vi.mocked(console.error).mock.calls);
    expect(logged).toContain(KEY);
    expect(logged).not.toContain(IP);
  });

  it("fails, counting nothing, when the hashing secret is not configured", async () => {
    vi.mocked(accountCodeSecret).mockImplementation(() => {
      throw new Error("Invalid booking configuration");
    });
    expect(await recordDirectoryEvent(event(), freshNow())).toBe("failed");
    expect(consumeRateLimit).not.toHaveBeenCalled();
    expect(incrementDirectoryDailyCount).not.toHaveBeenCalled();
  });
});

describe("readSignals", () => {
  it("includes only trending keys, reading the Asia/Kolkata day", async () => {
    const scored = new Map<string, DirectorySignal>([
      [KEY, { score: 25, previousScore: 0, trending: true }],
      [OTHER_KEY, { score: 5, previousScore: 0, trending: false }],
    ]);
    vi.mocked(readDirectorySignals).mockResolvedValue(scored);
    const lateEvening = new Date("2026-09-29T19:00:00.000Z");

    vi.mocked(readActiveDirectoryPaidTags).mockResolvedValue(new Map());
    vi.mocked(resolveDirectoryAsk).mockResolvedValue(unplaced([KEY, OTHER_KEY]));

    expect(await readSignals({ ids: [], keys: [KEY, OTHER_KEY] }, lateEvening)).toEqual({ signals: { [KEY]: { trending: true } } });
    expect(resolveDirectoryAsk).toHaveBeenCalledWith(DB, { ids: [], keys: [KEY, OTHER_KEY] });
    const lookup = { placeIds: [], unplacedKeys: [KEY, OTHER_KEY] };
    expect(readDirectorySignals).toHaveBeenCalledWith(DB, lookup, "2026-09-30");
    expect(readActiveDirectoryPaidTags).toHaveBeenCalledWith(DB, lookup, lateEvening);
  });

  it("reads a place once and answers under each id and key it was asked by", async () => {
    vi.mocked(resolveDirectoryAsk).mockResolvedValue({
      lookup: { placeIds: [OTHER_ID], unplacedKeys: [] },
      readAs: new Map([
        [OTHER_ID, OTHER_ID],
        [OTHER_KEY, OTHER_ID],
      ]),
    });
    vi.mocked(readDirectorySignals).mockResolvedValue(new Map([[OTHER_ID, { score: 30, previousScore: 0, trending: true }]]));
    vi.mocked(readActiveDirectoryPaidTags).mockResolvedValue(new Map<string, DirectoryPaidTag>([[OTHER_ID, "hot_new"]]));
    expect(await readSignals({ ids: [OTHER_ID], keys: [OTHER_KEY] }, NOW)).toEqual({
      signals: {
        [OTHER_ID]: { trending: true, paidTag: "hot_new" },
        [OTHER_KEY]: { trending: true, paidTag: "hot_new" },
      },
    });
  });

  it("adds each key's running paid tag, beside Trending or on its own", async () => {
    const THIRD_KEY = "salons/thane/kopri/glow-studio";
    vi.mocked(readDirectorySignals).mockResolvedValue(
      new Map<string, DirectorySignal>([
        [KEY, { score: 25, previousScore: 0, trending: true }],
        [OTHER_KEY, { score: 5, previousScore: 0, trending: false }],
      ]),
    );
    vi.mocked(readActiveDirectoryPaidTags).mockResolvedValue(
      new Map<string, DirectoryPaidTag>([
        [KEY, "hot_new"],
        [OTHER_KEY, "most_searched"],
      ]),
    );

    vi.mocked(resolveDirectoryAsk).mockResolvedValue(unplaced([KEY, OTHER_KEY, THIRD_KEY]));
    expect(await readSignals({ ids: [], keys: [KEY, OTHER_KEY, THIRD_KEY] }, NOW)).toEqual({
      signals: {
        [KEY]: { trending: true, paidTag: "hot_new" },
        [OTHER_KEY]: { trending: false, paidTag: "most_searched" },
      },
    });
  });

  it("adds how many times each business was shared, to a trending or paid one or on its own", async () => {
    const THIRD_KEY = "salons/thane/kopri/glow-studio";
    vi.mocked(readDirectorySignals).mockResolvedValue(new Map<string, DirectorySignal>([[KEY, { score: 25, previousScore: 0, trending: true }]]));
    vi.mocked(readActiveDirectoryPaidTags).mockResolvedValue(new Map<string, DirectoryPaidTag>([[OTHER_KEY, "most_searched"]]));
    vi.mocked(readDirectoryShareCounts).mockResolvedValue(
      new Map([
        [KEY, 12],
        [OTHER_KEY, 3],
        [THIRD_KEY, 1],
      ]),
    );

    vi.mocked(resolveDirectoryAsk).mockResolvedValue(unplaced([KEY, OTHER_KEY, THIRD_KEY]));
    expect(await readSignals({ ids: [], keys: [KEY, OTHER_KEY, THIRD_KEY] }, NOW)).toEqual({
      signals: {
        [KEY]: { trending: true, shares: 12 },
        [OTHER_KEY]: { trending: false, paidTag: "most_searched", shares: 3 },
        [THIRD_KEY]: { trending: false, shares: 1 },
      },
    });
    expect(readDirectoryShareCounts).toHaveBeenCalledWith(DB, { placeIds: [], unplacedKeys: [KEY, OTHER_KEY, THIRD_KEY] });
  });

  it("answers in the contract's shape", async () => {
    vi.mocked(readDirectorySignals).mockResolvedValue(new Map());
    vi.mocked(readActiveDirectoryPaidTags).mockResolvedValue(new Map([[KEY, "popular_near_you" as const]]));
    vi.mocked(readDirectoryShareCounts).mockResolvedValue(new Map([[KEY, 2]]));

    vi.mocked(resolveDirectoryAsk).mockResolvedValue(unplaced([KEY]));
    const response = await readSignals({ ids: [], keys: [KEY] }, NOW);

    expect(signalsResponseSchema.parse(response)).toEqual(response);
  });
});
