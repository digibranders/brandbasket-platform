import { STAFF_ACCESS_ACTIONS, type StaffAccessFilter } from "@brandbasket/db";
import { addDays, isIsoDate, zonedTimeToUtc } from "@brandbasket/shared/lib/calendar/local-date";

/** The team works in India's time, so a chosen day is an India day. */
const TIME_ZONE = "Asia/Kolkata";
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAGE = 10_000;

type Params = Readonly<Record<string, string | string[] | undefined>>;

/** The filters as they appear in the address, kept for the form's values and the paging links. */
export interface AccessLogValues {
  readonly person?: string;
  readonly action?: string;
  readonly client?: string;
  readonly from?: string;
  readonly to?: string;
}

function one(value: string | string[] | undefined): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

export function parseAccessLogFilters(params: Params): { readonly filter: StaffAccessFilter; readonly values: AccessLogValues; readonly page: number } {
  const person = one(params.person);
  const action = one(params.action);
  const client = one(params.client);
  const from = one(params.from);
  const to = one(params.to);
  const values: AccessLogValues = {
    ...(person !== undefined && person.length <= 128 ? { person } : {}),
    ...(action !== undefined && (STAFF_ACCESS_ACTIONS as readonly string[]).includes(action) ? { action } : {}),
    ...(client !== undefined && UUID.test(client) ? { client } : {}),
    ...(from !== undefined && isIsoDate(from) ? { from } : {}),
    ...(to !== undefined && isIsoDate(to) ? { to } : {}),
  };
  const filter: StaffAccessFilter = {
    ...(values.person === undefined ? {} : { staffUserId: values.person }),
    ...(values.action === undefined ? {} : { action: values.action }),
    ...(values.client === undefined ? {} : { businessId: values.client }),
    ...(values.from === undefined ? {} : { from: zonedTimeToUtc(values.from, "00:00", TIME_ZONE) }),
    ...(values.to === undefined ? {} : { to: zonedTimeToUtc(addDays(values.to, 1), "00:00", TIME_ZONE) }),
  };
  const rawPage = Number(one(params.page) ?? "0");
  const page = Number.isInteger(rawPage) && rawPage >= 0 && rawPage <= MAX_PAGE ? rawPage : 0;
  return { filter, values, page };
}

export function accessLogHref(values: AccessLogValues, page: number): string {
  const query = new URLSearchParams(Object.entries(values).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  if (page > 0) query.set("page", String(page));
  const text = query.toString();
  return text === "" ? "/access-log" : `/access-log?${text}`;
}
