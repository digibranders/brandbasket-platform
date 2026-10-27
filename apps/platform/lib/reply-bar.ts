/** The part of a key event this reads. React's KeyboardEvent fits it. */
export interface SendKeyEvent {
  readonly key: string;
  readonly metaKey: boolean;
  readonly ctrlKey: boolean;
}

/** Cmd+Enter or Ctrl+Enter sends a reply. Plain Enter and Shift+Enter keep making a new line. */
export function isSendShortcut(event: SendKeyEvent): boolean {
  return event.key === "Enter" && (event.metaKey || event.ctrlKey);
}

/** One line is 36px; six lines of 20px plus padding and the 2px border is 136px. Past it the field scrolls. */
export const REPLY_MAX_HEIGHT_PX = 136;
const BORDER_PX = 2;

/** The field's height for its content: `scrollHeight` already holds the padding, the border is added, and it stops at six lines. */
export function replyHeight(scrollHeight: number): number {
  return Math.min(scrollHeight + BORDER_PX, REPLY_MAX_HEIGHT_PX);
}
