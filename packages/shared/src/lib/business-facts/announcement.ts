/** The one-line banner a business's own site shows while it runs, e.g. a festival closure or a temporary offer. */
export const ANNOUNCEMENT_MAX_LENGTH = 100;

export interface Announcement {
  readonly message: string;
  readonly startsOn: string;
  readonly endsOn: string;
}

/** The announcement if it shows today (start and end days inclusive), else null. */
export function activeAnnouncement(announcement: Announcement | null, today: string): Announcement | null {
  if (announcement === null) return null;
  if (today < announcement.startsOn || today > announcement.endsOn) return null;
  return announcement;
}
