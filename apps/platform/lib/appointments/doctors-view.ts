/**
 * The appointments page's per-doctor pieces, pure and I/O-free: which doctor (if any) the `?doctor=` param picks,
 * narrowing a view's rows to that doctor, and laying one day out as a column per doctor for the Today view.
 *
 * A clinic with a single doctor never sees any of this: the doctor row only appears from two active doctors up, and
 * `resolveDoctorFilter` ignores the param below that, so a stale `?doctor=` left in a bookmark after a clinic goes
 * back to one doctor can never quietly hide bookings behind a filter the page no longer offers a way to clear.
 */

export interface DoctorRef {
  readonly id: string;
  readonly name: string;
}

/** What a doctor column is called when its id matches no practitioner the page read -- not expected (every booking
 * points at one of the business's practitioners, archived or not), but a booking is never dropped for it. */
const UNKNOWN_DOCTOR_NAME = "Doctor";

/**
 * The doctor `raw` names, or null for "All doctors". Anything that isn't exactly one of `activeDoctors`' ids -- a
 * missing param, a typo, an archived doctor, another clinic's id -- is All rather than an error or an empty page,
 * the same "every param falls back to something sensible" rule view-params.ts follows. Below two active doctors
 * there is nothing to choose between, so it is always All.
 */
export function resolveDoctorFilter(raw: string | undefined, activeDoctors: readonly DoctorRef[]): string | null {
  if (raw === undefined || activeDoctors.length < 2) return null;
  return activeDoctors.some((doctor) => doctor.id === raw) ? raw : null;
}

/**
 * The doctor name the booking details panel shows ("With …"), or null to show none. Matching the website, which only
 * names a doctor once there are two to choose between, a one-doctor clinic never sees it: it is shown from two
 * active doctors up, or when the booking's own doctor has since been archived (so the clinic has had two, and the
 * booking is not with the doctor who takes bookings now). Null too if the id names no doctor the page read.
 */
export function bookingDoctorName(practitionerId: string, activeDoctors: readonly DoctorRef[], allDoctors: readonly DoctorRef[]): string | null {
  const doctor = allDoctors.find((candidate) => candidate.id === practitionerId);
  if (doctor === undefined) return null;
  const isActive = activeDoctors.some((candidate) => candidate.id === practitionerId);
  return activeDoctors.length >= 2 || !isActive ? doctor.name : null;
}

/** `rows` narrowed to one doctor's, in their original order; every row, untouched, for null (All doctors). */
export function filterByPractitioner<T extends { readonly practitionerId: string }>(rows: readonly T[], practitionerId: string | null): readonly T[] {
  if (practitionerId === null) return rows;
  return rows.filter((row) => row.practitionerId === practitionerId);
}

export interface DayColumnTime {
  readonly start: string;
  readonly end: string;
}

export interface DayColumns<T> {
  /** Column order: every active doctor in display order (an empty column still says that doctor is free all day),
   * then any other doctor who has a booking that day -- one archived since, whose past bookings are still records. */
  readonly doctors: readonly DoctorRef[];
  /** One row per distinct start time across the whole day, ascending. */
  readonly times: readonly DayColumnTime[];
  /** The bookings at one doctor's column and one row's start, in the order given; empty when there are none. */
  readonly cell: (practitionerId: string, start: string) => readonly T[];
}

/**
 * Lays one day's bookings out as a table: a column per doctor, a row per start time. Rows come from the bookings
 * themselves rather than the clinic's slot grid, so a quiet day stays short (the Today list it replaces doesn't
 * show empty slots either) and a booking made under an older slot length still gets a row of its own. A row is
 * labelled with the first booking's end at that start; two bookings starting together but ending apart only happen
 * across a slot-length change, and each card shows its own time anyway.
 *
 * `allDoctors` (archived included) is only for naming a column that isn't among `activeDoctors`.
 */
export function buildDayColumns<T extends { readonly practitionerId: string; readonly localStart: string; readonly localEnd: string }>(
  rows: readonly T[],
  activeDoctors: readonly DoctorRef[],
  allDoctors: readonly DoctorRef[],
): DayColumns<T> {
  const byCell = new Map<string, T[]>();
  const endByStart = new Map<string, string>();
  const extraIds: string[] = [];
  const activeIds = new Set(activeDoctors.map((doctor) => doctor.id));

  for (const row of rows) {
    const key = cellKey(row.practitionerId, row.localStart);
    const list = byCell.get(key) ?? [];
    list.push(row);
    byCell.set(key, list);
    if (!endByStart.has(row.localStart)) endByStart.set(row.localStart, row.localEnd);
    if (!activeIds.has(row.practitionerId) && !extraIds.includes(row.practitionerId)) extraIds.push(row.practitionerId);
  }

  // Extra columns follow `allDoctors`' own (display) order where it knows them; an id it doesn't know goes last.
  const orderOf = (id: string): number => {
    const index = allDoctors.findIndex((doctor) => doctor.id === id);
    return index === -1 ? Number.MAX_SAFE_INTEGER : index;
  };
  const extras = [...extraIds]
    .sort((a, b) => orderOf(a) - orderOf(b))
    .map((id): DoctorRef => allDoctors.find((doctor) => doctor.id === id) ?? { id, name: UNKNOWN_DOCTOR_NAME });

  const times = [...endByStart.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([start, end]): DayColumnTime => ({ start, end }));

  return {
    doctors: [...activeDoctors, ...extras],
    times,
    cell: (practitionerId, start) => byCell.get(cellKey(practitionerId, start)) ?? [],
  };
}

function cellKey(practitionerId: string, start: string): string {
  return `${practitionerId}@${start}`;
}
