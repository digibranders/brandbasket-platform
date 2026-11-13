/**
 * Counts an affiliate's members without a silent cap. The old dashboard asked for 500 and showed that as the total once
 * there were more. packages/db has a list with a limit and no offset or count, so this asks again with a larger limit until
 * the answer comes back shorter than the limit asked for, which can only happen when it holds everyone. Past `ceiling` it
 * throws instead of showing a wrong total.
 * shortcut: re-reads the list on growth. Replace with a count query in packages/db when one exists.
 */
export const MEMBER_PAGE = 500;
export const MEMBER_CEILING = 64_000;

export class TooManyMembersError extends Error {
  constructor(ceiling: number) {
    super(`More than ${ceiling} members: the dashboard needs a count query.`);
    this.name = "TooManyMembersError";
  }
}

export interface MemberCounts {
  /** Businesses that have paid on one of the codes. */
  readonly total: number;
  /** Of those, the ones whose latest plan on a code is running (status `active`). */
  readonly paying: number;
}

/** One subscription that paid on one of the codes, newest first, as listAffiliateMembers returns them. */
export interface MemberSubscription {
  readonly businessId: string;
  readonly status: string;
}

/**
 * A member is a business, not a subscription: a code carried onto a reactivated or kept plan (plan 18) gives the same business
 * a second row. The list is newest first, so a business's first row is its latest plan and decides whether it is paying.
 */
export function membersOf(rows: readonly MemberSubscription[]): MemberCounts {
  const latest = new Map<string, string>();
  for (const row of rows) if (!latest.has(row.businessId)) latest.set(row.businessId, row.status);
  return { total: latest.size, paying: [...latest.values()].filter((status) => status === "active").length };
}

export async function countMembers(
  fetchMembers: (limit: number) => Promise<readonly MemberSubscription[]>,
  page: number = MEMBER_PAGE,
  ceiling: number = MEMBER_CEILING,
): Promise<MemberCounts> {
  for (let limit = page; ; limit *= 2) {
    const rows = await fetchMembers(limit);
    if (rows.length < limit) return membersOf(rows);
    if (limit >= ceiling) throw new TooManyMembersError(ceiling);
  }
}
