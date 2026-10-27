/** What the Staff page says after an action, carried in the address as ?notice=<code>. */
export const STAFF_NOTICES = {
  invited: { ok: true, text: "Invite sent. The link works once and expires in 3 days." },
  resent: { ok: true, text: "A new invite is on its way. The old link no longer works." },
  "role-changed": { ok: true, text: "Role changed. It applies from their next page." },
  "switched-off": { ok: true, text: "Switched off. They were signed out everywhere." },
  "switched-on": { ok: true, text: "Switched back on. They can sign in again." },
  "bad-invite": { ok: false, text: "Enter a work email and choose a role." },
  "already-staff": { ok: false, text: "They are already on the team. Change their role or switch them on instead." },
  "invite-gone": { ok: false, text: "That invite was already used or replaced." },
  "not-found": { ok: false, text: "That person is not on the team." },
  "self-off": { ok: false, text: "You can't switch yourself off. Ask another admin." },
  "self-role": { ok: false, text: "You can't change your own role. Ask another admin." },
  "last-admin": { ok: false, text: "Keep at least one active admin." },
  "already-on": { ok: false, text: "They can already sign in." },
  "already-off": { ok: false, text: "They are already switched off." },
} as const satisfies Readonly<Record<string, { readonly ok: boolean; readonly text: string }>>;

export type StaffNotice = keyof typeof STAFF_NOTICES;

export function readStaffNotice(value: unknown): StaffNotice | null {
  return typeof value === "string" && Object.hasOwn(STAFF_NOTICES, value) ? (value as StaffNotice) : null;
}
