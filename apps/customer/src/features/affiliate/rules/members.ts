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
  readonly total: number;
  /** Members whose plan is running (status `active`). */
  readonly paying: number;
}

export async function countMembers(
  fetchMembers: (limit: number) => Promise<readonly { readonly status: string }[]>,
  page: number = MEMBER_PAGE,
  ceiling: number = MEMBER_CEILING,
): Promise<MemberCounts> {
  for (let limit = page; ; limit *= 2) {
    const rows = await fetchMembers(limit);
    if (rows.length < limit) return { total: rows.length, paying: rows.filter((row) => row.status === "active").length };
    if (limit >= ceiling) throw new TooManyMembersError(ceiling);
  }
}
