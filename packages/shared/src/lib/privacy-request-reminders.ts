import { requestUrgency } from "./privacy-request-deadlines";

/*
 * Which open requests the nightly reminder email lists. A request moves through four stages as its due date nears: nothing
 * yet (0), a reminder at day 20 of 30 (1), urgent at day 25 (2), overdue (3). It is listed the first night it reaches a
 * stage it has not been reminded of, and an overdue one is listed every night until it is closed, since an answer owed
 * past the date is the case that must not be forgotten.
 */

export type ReminderStage = 0 | 1 | 2 | 3;

export interface ReminderCandidate {
  readonly id: string;
  readonly receivedAt: Date;
  readonly dueAt: Date;
  readonly closedAt: Date | null;
  /** The highest stage already emailed about. */
  readonly reminderStage: number;
}

export interface DueReminder<T extends ReminderCandidate> {
  readonly request: T;
  readonly stage: Exclude<ReminderStage, 0>;
}

/** The stage a request has reached by `now`, from how close its due date is (see requestUrgency). */
export function reminderStageOf(request: ReminderCandidate, now: Date): ReminderStage {
  switch (requestUrgency(request, now)) {
    case "reminder":
      return 1;
    case "urgent":
      return 2;
    case "overdue":
      return 3;
    case "on_track":
    case "done_on_time":
    case "done_late":
      return 0;
  }
}

/** The open requests to list tonight, the soonest due first, each with the stage it has reached. */
export function selectReminders<T extends ReminderCandidate>(requests: readonly T[], now: Date): readonly DueReminder<T>[] {
  const due: DueReminder<T>[] = [];
  for (const request of requests) {
    if (request.closedAt !== null) continue;
    const stage = reminderStageOf(request, now);
    if (stage === 0) continue;
    if (stage > request.reminderStage || stage === 3) due.push({ request, stage });
  }
  return due.sort((a, b) => a.request.dueAt.getTime() - b.request.dueAt.getTime());
}
