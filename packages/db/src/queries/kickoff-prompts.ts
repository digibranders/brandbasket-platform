import { and, asc, eq, gt, inArray, isNull, lte, sql } from "drizzle-orm";
import type { Database } from "../client";
import { kickoffPromptState, setupCallBookings } from "../schema";

type Runner = Pick<Database, "select" | "insert" | "update" | "delete" | "execute">;

const HOUR_MS = 3_600_000;
const DAY_MS = 24 * HOUR_MS;

/** How long after the popup was last shown it shows again, until staff answer. */
export const KICKOFF_PROMPT_REPEAT_MS = 15 * 60 * 1000;
/** A call still unanswered this long after it ended gets one more push. */
export const KICKOFF_REMINDER_PUSH_AFTER_MS = 2 * HOUR_MS;

/** A kickoff call that has ended and has not been answered, with what the server remembers about its prompt. */
export interface PendingKickoffPrompt {
  readonly callId: string;
  readonly businessId: string;
  readonly businessName: string;
  readonly startsAt: Date | null;
  readonly endsAt: Date;
  readonly firstNotifiedAt: Date | null;
  readonly lastPopupShownAt: Date | null;
  readonly answeredAt: Date | null;
  readonly reminderPushedAt: Date | null;
}

/** The popup shows when the call is unanswered and it was never shown or was shown at least 15 minutes ago. */
export function isKickoffPromptDue(state: Pick<PendingKickoffPrompt, "answeredAt" | "lastPopupShownAt">, now: Date): boolean {
  if (state.answeredAt !== null) return false;
  return state.lastPopupShownAt === null || now.getTime() - state.lastPopupShownAt.getTime() >= KICKOFF_PROMPT_REPEAT_MS;
}

type Raw = {
  call_id: string;
  business_id: string;
  business_name: string;
  starts_at: string | Date | null;
  ends_at: string | Date;
  first_notified_at: string | Date | null;
  last_popup_shown_at: string | Date | null;
  answered_at: string | Date | null;
  reminder_pushed_at: string | Date | null;
};

const date = (value: string | Date | null): Date | null => (value === null ? null : new Date(value));

/**
 * Every kickoff call that has ended, is not marked held and is not answered, ended within `lookBackDays`, and whose website
 * project has not moved past onboarding (a call that already started its build needs no answer). Oldest end first. A call
 * with no booking time has no end and is left out. Staff connection.
 */
export async function listPendingKickoffPrompts(db: Runner, input: { readonly now: Date; readonly lookBackDays: number }): Promise<PendingKickoffPrompt[]> {
  const since = new Date(input.now.getTime() - input.lookBackDays * DAY_MS);
  const result = await db.execute(sql`
    select c.id as call_id, b.id as business_id, b.name as business_name, c.starts_at, c.ends_at,
      s.first_notified_at, s.last_popup_shown_at, s.answered_at, s.reminder_pushed_at
    from setup_call_bookings c
    join businesses b on b.id = c.business_id
    left join kickoff_prompt_state s on s.call_id = c.id
    where c.held_at is null and c.ends_at is not null
      and c.ends_at <= ${input.now.toISOString()}::timestamptz and c.ends_at >= ${since.toISOString()}::timestamptz
      and s.answered_at is null
      and coalesce((select p.status from projects p where p.business_id = b.id order by p.created_at desc limit 1), 'onboarding') = 'onboarding'
    order by c.ends_at asc`);
  return (result.rows as Raw[]).map((row) => ({
    callId: row.call_id,
    businessId: row.business_id,
    businessName: row.business_name,
    startsAt: date(row.starts_at),
    endsAt: new Date(row.ends_at),
    firstNotifiedAt: date(row.first_notified_at),
    lastPopupShownAt: date(row.last_popup_shown_at),
    answeredAt: date(row.answered_at),
    reminderPushedAt: date(row.reminder_pushed_at),
  }));
}

/** Notes that the popup was shown for these calls now, so it shows again in 15 minutes. Staff connection. */
export async function markKickoffPromptsShown(db: Runner, callIds: readonly string[], now: Date): Promise<void> {
  if (callIds.length === 0) return;
  await db
    .insert(kickoffPromptState)
    .values(callIds.map((callId) => ({ callId, lastPopupShownAt: now })))
    .onConflictDoUpdate({ target: kickoffPromptState.callId, set: { lastPopupShownAt: now, updatedAt: now } });
}

/** Notes when staff were first told the call had ended; the first time stays. Staff connection. */
export async function markKickoffFirstNotified(db: Runner, callId: string, now: Date): Promise<void> {
  await db
    .insert(kickoffPromptState)
    .values({ callId, firstNotifiedAt: now })
    .onConflictDoUpdate({ target: kickoffPromptState.callId, set: { firstNotifiedAt: sql`coalesce(${kickoffPromptState.firstNotifiedAt}, ${now.toISOString()}::timestamptz)`, updatedAt: now } });
}

/** Notes that the 2 hour reminder push went out; the first time stays. Staff connection. */
export async function markKickoffReminderPushed(db: Runner, callId: string, now: Date): Promise<void> {
  await db
    .insert(kickoffPromptState)
    .values({ callId, reminderPushedAt: now })
    .onConflictDoUpdate({ target: kickoffPromptState.callId, set: { reminderPushedAt: sql`coalesce(${kickoffPromptState.reminderPushedAt}, ${now.toISOString()}::timestamptz)`, updatedAt: now } });
}

/** Notes that staff answered the business's call prompt (Call completed). A business with no booking has nothing to note. Staff connection. */
export async function markKickoffPromptAnswered(db: Runner, businessId: string, now: Date): Promise<void> {
  const [booking] = await db.select({ id: setupCallBookings.id }).from(setupCallBookings).where(eq(setupCallBookings.businessId, businessId)).limit(1);
  if (booking === undefined) return;
  await db
    .insert(kickoffPromptState)
    .values({ callId: booking.id, answeredAt: now })
    .onConflictDoUpdate({ target: kickoffPromptState.callId, set: { answeredAt: sql`coalesce(${kickoffPromptState.answeredAt}, ${now.toISOString()}::timestamptz)`, updatedAt: now } });
}

/** Forgets a call's prompt state, because its time moved and the call has not ended yet in its new slot. Staff connection. */
export async function clearKickoffPromptState(db: Runner, callId: string): Promise<void> {
  await db.delete(kickoffPromptState).where(eq(kickoffPromptState.callId, callId));
}

/**
 * Forgets the prompt state of the business's booked call: the customer booked a new time, and the call keeps its row. The
 * booking runs under the customer role, which cannot touch this table, so the caller does this with the staff connection.
 */
export async function clearKickoffPromptStateForBusiness(db: Runner, businessId: string): Promise<void> {
  const calls = db.select({ id: setupCallBookings.id }).from(setupCallBookings).where(eq(setupCallBookings.businessId, businessId));
  await db.delete(kickoffPromptState).where(inArray(kickoffPromptState.callId, calls));
}

/** A booked call that has not started. */
export interface SoonKickoff {
  readonly callId: string;
  readonly businessId: string;
  readonly startsAt: Date;
}

/** Calls starting after `now` and within `withinMs`, not marked held, soonest first. Staff connection. */
export async function listKickoffsStartingSoon(db: Runner, input: { readonly now: Date; readonly withinMs: number }): Promise<SoonKickoff[]> {
  const rows = await db
    .select({ callId: setupCallBookings.id, businessId: setupCallBookings.businessId, startsAt: setupCallBookings.startsAt })
    .from(setupCallBookings)
    .where(and(isNull(setupCallBookings.heldAt), gt(setupCallBookings.startsAt, input.now), lte(setupCallBookings.startsAt, new Date(input.now.getTime() + input.withinMs))))
    .orderBy(asc(setupCallBookings.startsAt));
  return rows.flatMap((row) => (row.startsAt === null ? [] : [{ callId: row.callId, businessId: row.businessId, startsAt: row.startsAt }]));
}
