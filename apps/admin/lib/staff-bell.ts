import { clock, shortDate } from "./team-time";

/** A stored staff notice, as the database returns it. */
export interface StaffBellRow {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly link: string | null;
  readonly createdAt: Date;
  readonly readAt: Date | null;
}

export interface StaffBellItem {
  readonly id: string;
  readonly title: string;
  readonly body: string | null;
  readonly href: string;
  /** "17 Nov, 10:00", in India time. */
  readonly when: string;
  readonly unread: boolean;
}

export interface StaffBellView {
  readonly items: readonly StaffBellItem[];
  readonly unread: number;
}

/** The console bell's lines from the stored staff notices (newest first, as read). Plain data, so the client bell can take it as props. */
export function staffBellView(rows: readonly StaffBellRow[]): StaffBellView {
  const items = rows.map(
    (row): StaffBellItem => ({
      id: row.id,
      title: row.title,
      body: row.body,
      href: row.link ?? "/",
      when: `${shortDate(row.createdAt)}, ${clock(row.createdAt)}`,
      unread: row.readAt === null,
    }),
  );
  return { items, unread: items.filter((item) => item.unread).length };
}
