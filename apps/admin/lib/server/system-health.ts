import "server-only";
import { countActiveErrorIssues, listRecentEmails } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { clock, shortDate, todayRange } from "@/lib/team-time";
import { getStaffDb } from "./db";

export type SystemState = "ok" | "warn" | "bad";

/** One line of the systems block: a source, whether it is working, and a few words of detail. */
export interface SystemLine {
  readonly key: string;
  readonly label: string;
  readonly state: SystemState;
  readonly detail: string;
}

/** Something whose health Today shows. `read` may throw; the block then says it could not check. */
export interface SystemSource {
  readonly key: string;
  readonly label: string;
  readonly read: (now: Date) => Promise<Pick<SystemLine, "state" | "detail">>;
}

/** A clock for something that happened today, a date for anything older. */
function when(date: Date, now: Date): string {
  return date.getTime() >= todayRange(now).start.getTime() ? clock(date) : shortDate(date);
}

const email: SystemSource = {
  key: "email",
  label: "Email",
  read: async (now) => {
    const [latest] = await listRecentEmails(getStaffDb(), 1);
    // shortcut: email_messages has no delivery status yet, so this can only say when mail last went out; Phase 6 adds failures.
    return latest === undefined ? { state: "ok", detail: "nothing sent yet" } : { state: "ok", detail: `last ${when(latest.createdAt, now)}` };
  },
};

const errors: SystemSource = {
  key: "errors",
  label: "Website errors",
  read: async () => {
    const open = await countActiveErrorIssues(getStaffDb());
    return open === 0 ? { state: "ok", detail: "0 new" } : { state: "bad", detail: `${open} open` };
  },
};

/** Phase 6 adds the Razorpay, Cal.com, OyeChats and Teams sources to this list; the page draws whatever it holds. */
export const SYSTEM_SOURCES: readonly SystemSource[] = [email, errors];

/** Every source's line, in list order. One source failing never hides the others. */
export async function readSystemHealth(now: Date = new Date(), sources: readonly SystemSource[] = SYSTEM_SOURCES): Promise<readonly SystemLine[]> {
  return Promise.all(
    sources.map(async (source): Promise<SystemLine> => {
      try {
        return { key: source.key, label: source.label, ...(await source.read(now)) };
      } catch (error) {
        console.error(`[system-health] could not check ${source.key}`, errorLogInfo(error));
        return { key: source.key, label: source.label, state: "warn", detail: "could not check" };
      }
    }),
  );
}
