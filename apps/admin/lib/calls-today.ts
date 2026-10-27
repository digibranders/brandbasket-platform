/** The pill beside a call on Today. The tones are StatusPill tones. */
export interface CallTiming {
  readonly label: string;
  readonly tone: "done" | "progress" | "todo";
}

const MINUTE_MS = 60_000;

export function callTiming(startsAt: Date, endsAt: Date, now: Date): CallTiming {
  const at = now.getTime();
  if (at >= endsAt.getTime()) return { label: "Done", tone: "done" };
  if (at >= startsAt.getTime()) return { label: "Now", tone: "progress" };
  const minutes = Math.ceil((startsAt.getTime() - at) / MINUTE_MS);
  if (minutes < 60) return { label: `In ${minutes}m`, tone: "progress" };
  if (minutes <= 120) return { label: `In ${Math.round(minutes / 60)}h`, tone: "progress" };
  return { label: "Later", tone: "todo" };
}
