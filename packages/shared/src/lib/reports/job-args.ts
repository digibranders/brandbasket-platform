import { lastFullMonth, parseMonthKey, type MonthKey } from "./period";

export interface MonthlyReportArgs {
  readonly month: MonthKey;
  readonly dryRun: boolean;
  readonly businessId?: string;
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

/** `--month 2026-10` (default: the last full month in India), `--dry-run`, `--business <uuid>`. Throws a message for anything else. */
export function parseMonthlyReportArgs(argv: readonly string[], now: Date): MonthlyReportArgs {
  let month: MonthKey = lastFullMonth(now);
  let dryRun = false;
  let businessId: string | undefined;
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (flag === "--dry-run") dryRun = true;
    else if (flag === "--month") {
      const parsed = parseMonthKey(argv[++index] ?? "");
      if (parsed === null) throw new Error("--month needs a month such as 2026-10");
      month = parsed;
    } else if (flag === "--business") {
      const value = argv[++index] ?? "";
      if (!UUID.test(value)) throw new Error("--business needs a business id (a lowercase UUID)");
      businessId = value;
    } else throw new Error(`Unknown option ${String(flag)}. Use --month YYYY-MM, --dry-run or --business <id>.`);
  }
  return { month, dryRun, ...(businessId === undefined ? {} : { businessId }) };
}
