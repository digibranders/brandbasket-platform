/** A promised date the customer is shown only while it is still ahead: once it passes, the page falls back to the line that names no date rather than promise a day that is gone. */
export function stillAhead(due: Date | null, now: Date): Date | null {
  return due !== null && due.getTime() > now.getTime() ? due : null;
}
