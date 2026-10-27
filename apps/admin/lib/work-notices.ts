/** What the client page says after staff change a customer's posts, pages, listings or reports (`?work=`). The query only picks a line. */
export const WORK_NOTICES = [
  "added",
  "saved",
  "moved",
  "deleted",
  "report-saved",
  "report-removed",
  "invalid",
  "bad-picture",
  "not-ready",
  "not-bought",
  "locked",
  "wrong-state",
] as const;
export type WorkNotice = (typeof WORK_NOTICES)[number];

export const WORK_NOTICE_TEXT: Readonly<Record<WorkNotice, { readonly text: string; readonly ok: boolean }>> = {
  added: { text: "Added.", ok: true },
  saved: { text: "Saved.", ok: true },
  moved: { text: "Done.", ok: true },
  deleted: { text: "Deleted.", ok: true },
  "report-saved": { text: "Report link saved.", ok: true },
  "report-removed": { text: "Report link removed.", ok: true },
  invalid: { text: "Check the form: a title of 3 to 140 characters, a real date, and a link that starts with https://.", ok: false },
  "bad-picture": { text: "That picture could not be used. Choose a JPEG, PNG or WebP picture and try again.", ok: false },
  "not-ready": { text: "This post is not ready to send: it needs a caption or a picture, and a date of today or later.", ok: false },
  "not-bought": { text: "That service is not on this customer's plan.", ok: false },
  locked: { text: "An approved or published item cannot be edited. Take a post back first if it needs a change.", ok: false },
  "wrong-state": { text: "That cannot be done from where this item is now. Reload and look again.", ok: false },
};

/** The notice named by the query, or null for anything else. */
export function readWorkNotice(value: string | string[] | undefined): WorkNotice | null {
  return typeof value === "string" && (WORK_NOTICES as readonly string[]).includes(value) ? (value as WorkNotice) : null;
}
