/**
 * What GET /api/site/info returns. A copy of the platform's apps/platform/lib/site-info.ts.
 * ADDITIVE CHANGES ONLY: client sites deploy on their own schedule and keep a copy of this file.
 */
export interface SiteInfoHours {
  /** 0-6, Monday = 0. A day may appear more than once (split shifts); a day that never appears has no hours given. */
  readonly dayOfWeek: number;
  /** "HH:MM", null when closed or open all day. A closing time earlier than the opening time means after midnight. */
  readonly opensAt: string | null;
  readonly closesAt: string | null;
  readonly closed: boolean;
  readonly openAllDay: boolean;
}
export interface SiteInfoClosure {
  readonly startsOn: string; // YYYY-MM-DD, inclusive
  readonly endsOn: string; // YYYY-MM-DD, inclusive
  readonly note: string | null;
  /** HH:MM, both or neither: a half day keeps these hours instead of being shut. Absent means shut all day. */
  readonly opensAt?: string;
  readonly closesAt?: string;
}
export interface SiteInfoService {
  readonly id: string;
  readonly name: string;
}
export interface SiteInfoPractitioner {
  readonly id: string;
  readonly name: string;
  readonly title: string | null;
  /** Absolute URL of a square photo, or null to show initials. */
  readonly photoUrl: string | null;
}
export interface SiteInfoBooking {
  readonly accepting: boolean;
  readonly pausedMessage: string | null;
  readonly services: readonly SiteInfoService[];
  /** Length of every slot in minutes. */
  readonly slotMinutes: number;
  /** Active doctors in the clinic's order. Missing from platforms older than 2026-09-28. */
  readonly practitioners?: readonly SiteInfoPractitioner[];
}
export interface SiteInfo {
  readonly business: string;
  readonly timeZone: string;
  /** Today where the business is, YYYY-MM-DD. */
  readonly today: string;
  readonly hours: readonly SiteInfoHours[];
  /** Current and upcoming closures only, soonest first. */
  readonly closures: readonly SiteInfoClosure[];
  /** Only while it shows today. */
  readonly announcement: { readonly message: string; readonly endsOn: string } | null;
  /** Null when the business does not take online appointments. */
  readonly booking: SiteInfoBooking | null;
}
