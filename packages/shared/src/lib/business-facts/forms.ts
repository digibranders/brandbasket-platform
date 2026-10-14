/** Parses the client's Announcement and Closures editor forms. Both are plain single-page forms, so no zod schema
 * is needed: each field is read, cleaned and checked in the order a person fills the form in. */
import { isIsoDate } from "../calendar/local-date";
import { textField, type FormParseResult } from "../form-result";
import { cleanLine } from "../validation/text";
import { ANNOUNCEMENT_MAX_LENGTH, type Announcement } from "./announcement";
import { CLOSURE_NOTE_MAX_LENGTH } from "./closures";

/**
 * `cleanLine` turns an embedded line break into a single space, so by the time a message has been cleaned there is
 * no way to tell it apart from one that was always a single line. The announcement and closure note must stay
 * genuinely one line, so this checks the raw value first.
 */
const HAS_LINE_BREAK = /[\r\n\u2028\u2029]/;

export type AnnouncementInput = Announcement;

export function parseAnnouncementForm(formData: FormData): FormParseResult<AnnouncementInput> {
  const rawMessage = textField(formData, "message");
  const message = cleanLine(rawMessage);
  if (HAS_LINE_BREAK.test(rawMessage) || message.length < 1 || message.length > ANNOUNCEMENT_MAX_LENGTH) {
    return {
      success: false,
      field: "message",
      message: `Write the announcement in one line, up to ${ANNOUNCEMENT_MAX_LENGTH} characters.`,
    };
  }

  const startsOn = textField(formData, "startsOn").trim();
  if (!isIsoDate(startsOn)) {
    return { success: false, field: "startsOn", message: "Choose the day it starts." };
  }

  const endsOn = textField(formData, "endsOn").trim();
  if (!isIsoDate(endsOn)) {
    return { success: false, field: "endsOn", message: "Choose the last day it shows." };
  }
  if (endsOn < startsOn) {
    return { success: false, field: "endsOn", message: "The last day can't be before the first." };
  }

  return { success: true, data: { message, startsOn, endsOn } };
}

export interface ClosureInput {
  readonly startsOn: string;
  readonly endsOn: string;
  readonly note: string | null;
  /** Both `HH:MM` for a half day, both null for a day shut all day. */
  readonly opensAt: string | null;
  readonly closesAt: string | null;
}

const TIME_OF_DAY = /^(?:[01]\d|2[0-3]):[0-5]\d$/;

export function parseClosureForm(formData: FormData): FormParseResult<ClosureInput> {
  const startsOn = textField(formData, "startsOn").trim();
  if (!isIsoDate(startsOn)) {
    return { success: false, field: "startsOn", message: "Choose the first closed day." };
  }

  const endsOn = textField(formData, "endsOn").trim();
  if (!isIsoDate(endsOn)) {
    return { success: false, field: "endsOn", message: "Choose the last closed day." };
  }
  if (endsOn < startsOn) {
    return { success: false, field: "endsOn", message: "The last day can't be before the first." };
  }

  const rawNote = textField(formData, "note");
  const cleanedNote = cleanLine(rawNote);
  if (HAS_LINE_BREAK.test(rawNote) || cleanedNote.length > CLOSURE_NOTE_MAX_LENGTH) {
    return { success: false, field: "note", message: `Keep the note to ${CLOSURE_NOTE_MAX_LENGTH} characters.` };
  }

  const note = cleanedNote === "" ? null : cleanedNote;
  // "kind" is only sent by the holiday form: "closed" (the default, and all a doctor's leave ever is) or "hours".
  if (textField(formData, "kind") !== "hours") return { success: true, data: { startsOn, endsOn, note, opensAt: null, closesAt: null } };

  const opensAt = textField(formData, "opensAt").trim();
  if (!TIME_OF_DAY.test(opensAt)) return { success: false, field: "opensAt", message: "Choose the time you open." };
  const closesAt = textField(formData, "closesAt").trim();
  if (!TIME_OF_DAY.test(closesAt)) return { success: false, field: "closesAt", message: "Choose the time you close." };
  if (opensAt === closesAt) return { success: false, field: "closesAt", message: "Opening and closing can't be the same time." };
  return { success: true, data: { startsOn, endsOn, note, opensAt, closesAt } };
}
