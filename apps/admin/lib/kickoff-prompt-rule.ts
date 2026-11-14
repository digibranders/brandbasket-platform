/**
 * How often the kickoff prompt notification re-appears in the console after being dismissed,
 * repeating until answered (15 minutes).
 */
export const KICKOFF_NOTIFICATION_REPEAT_MS = 15 * 60 * 1000;

export interface PromptRuleInput {
  readonly hasPending: boolean;
  readonly dismissedAt: number | null;
  readonly now: number;
  readonly repeatMs?: number;
}

/**
 * Pure rule for when the Kickoff PromptPopup should be shown.
 * When a booked kickoff time passes, it shows immediately; if dismissed, a notification repeats until answered.
 */
export function shouldShowKickoffPrompt(input: PromptRuleInput): boolean {
  if (!input.hasPending) return false;
  if (input.dismissedAt === null) return true;
  const interval = input.repeatMs ?? KICKOFF_NOTIFICATION_REPEAT_MS;
  return input.now - input.dismissedAt >= interval;
}
