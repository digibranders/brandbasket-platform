import { describe, expect, it, vi } from "vitest";
import { countMembers, TooManyMembersError } from "./members";

/** A list that holds `size` members, the first `paying` of them active, answering like packages/db: at most `limit`. */
function list(size: number, paying: number) {
  return vi.fn(async (limit: number) => Array.from({ length: Math.min(limit, size) }, (_, index) => ({ status: index < paying ? "active" : "cancelled" })));
}

describe("countMembers", () => {
  it("counts a small list in one read", async () => {
    const fetch = list(3, 2);
    expect(await countMembers(fetch, 10)).toEqual({ total: 3, paying: 2 });
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("counts none", async () => {
    expect(await countMembers(list(0, 0), 10)).toEqual({ total: 0, paying: 0 });
  });

  it("does not stop at the page size: 1,200 members are 1,200, not 500", async () => {
    const fetch = list(1200, 700);
    expect(await countMembers(fetch)).toEqual({ total: 1200, paying: 700 });
    expect(fetch.mock.calls.map(([limit]) => limit)).toEqual([500, 1000, 2000]);
  });

  it("asks again when the list is exactly as long as the page, in case there are more", async () => {
    expect(await countMembers(list(10, 10), 10)).toEqual({ total: 10, paying: 10 });
  });

  it("fails loudly past the ceiling rather than showing a wrong total", async () => {
    await expect(countMembers(list(100, 1), 10, 40)).rejects.toBeInstanceOf(TooManyMembersError);
  });
});
