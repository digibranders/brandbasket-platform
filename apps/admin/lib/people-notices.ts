export const PEOPLE_NOTICES = {
  renamed: { text: "Name saved.", ok: true },
  "invalid-name": { text: "Nothing saved: give a name of 1 to 60 characters.", ok: false },
  "not-owner": { text: "Nothing saved: that person is not an owner of this business.", ok: false },
  restored: { text: "Account restored. They can sign in again; a plan they cancelled stays cancelled.", ok: true },
  extended: { text: "Erase date moved 30 days later.", ok: true },
  "no-closure": { text: "Nothing changed: this account is not leaving.", ok: false },
} as const satisfies Readonly<Record<string, { readonly text: string; readonly ok: boolean }>>;

export type PeopleNotice = keyof typeof PEOPLE_NOTICES;

export function readPeopleNotice(value: string | string[] | undefined): PeopleNotice | null {
  return typeof value === "string" && Object.hasOwn(PEOPLE_NOTICES, value) ? (value as PeopleNotice) : null;
}

export function peopleNoticeHref(businessId: string, notice: PeopleNotice): string {
  return `/clients/${businessId}/people?people=${notice}`;
}
