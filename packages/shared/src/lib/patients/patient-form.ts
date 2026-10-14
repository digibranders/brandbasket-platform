/** Turns the patient register's forms (edit, merge, delete, search) and reception's Add booking form into typed
 * commands. Pure: no database and no `"use server"`; the platform's actions check access, run the command inside
 * the tenant scope, and map the outcome back to a form state.
 *
 * Imports validation/phone.ts, which is `"server-only"`, so this module is server-only too. The forms themselves
 * read field names and limits from fields.ts and limits.ts, which import nothing. */
import { z } from "zod";
import { isIsoDate } from "../calendar/local-date";
import { textField, type FormParseResult } from "../form-result";
import { PHONE_COUNTRY_FIELD } from "../phone/fields";
import { parsePhoneEntry } from "../validation/phone";
import { cleanLine } from "../validation/text";
import {
  ALT_PHONE_COUNTRY_FIELD,
  ALT_PHONE_FIELD,
  ANY_DOCTOR,
  BOOKING_DATE_FIELD,
  BOOKING_DOCTOR_FIELD,
  BOOKING_SERVICE_FIELD,
  BOOKING_START_FIELD,
  MERGE_KEEP_ID_FIELD,
  MERGE_REMOVE_ID_FIELD,
  PATIENT_ID_FIELD,
  PATIENT_NAME_FIELD,
  PATIENT_PHONE_FIELD,
  PATIENT_TAGS_FIELD,
} from "./fields";
import { PATIENT_NAME_MAX_LENGTH, PATIENT_SEARCH_MAX_LENGTH, PATIENT_TAG_MAX_LENGTH, PATIENT_TAGS_MAX } from "./limits";

export const PATIENT_NOT_FOUND_MESSAGE = "That patient could not be found. Refresh the page and try again.";
export const PATIENT_NAME_MISSING_MESSAGE = "Enter the patient's name.";
export const PATIENT_NAME_TOO_LONG_MESSAGE = `Keep the name to ${String(PATIENT_NAME_MAX_LENGTH)} characters.`;
export const TOO_MANY_TAGS_MESSAGE = `Up to ${String(PATIENT_TAGS_MAX)} tags.`;
export const MERGE_PHONE_MISSING_MESSAGE = "Enter the other record's phone number.";
export const MERGE_SAME_PATIENT_MESSAGE = "Choose a different patient to merge.";
export const BOOKING_PHONE_MISSING_MESSAGE = "Enter the patient's phone number.";
export const CHOOSE_DAY_MESSAGE = "Choose a day.";
export const CHOOSE_TIME_MESSAGE = "Choose a time.";
export const CHOOSE_DOCTOR_MESSAGE = "Choose a doctor from the list.";
export const CHOOSE_SERVICE_MESSAGE = "Choose a service from the list.";

/** A tag longer than this is shortened in its error message, so a pasted paragraph cannot flood the form. */
const TAG_PREVIEW_LENGTH = PATIENT_TAG_MAX_LENGTH;

/** "Ravi, a very long tag..." names the offending tag so reception knows which one to shorten. */
export function tagTooLongMessage(tag: string): string {
  const shown = tag.length > TAG_PREVIEW_LENGTH ? `${tag.slice(0, TAG_PREVIEW_LENGTH)}…` : tag;
  return `"${shown}" is too long. Keep tags to ${String(PATIENT_TAG_MAX_LENGTH)} characters.`;
}

/** 00:00-23:59; the slot finder never offers anything outside it. */
const START_TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
const uuidFormat = z.uuid();
const WHITESPACE_RUN = /\s+/g;
const NON_DIGITS = /\D/g;
const HIGH_SURROGATE_AT_END = /[\uD800-\uDBFF]$/;
/** Fewer digits than this match far too many numbers to be a useful phone search. */
const SEARCH_DIGITS_MIN = 3;

/** A malformed id is not a typing mistake (ids come from hidden inputs), so it reads the same as a stale record. */
const NOT_FOUND_RESULT: FormParseResult<never> = { success: false, field: null, message: PATIENT_NOT_FOUND_MESSAGE };

function refuse(field: string | null, message: string): FormParseResult<never> {
  return { success: false, field, message };
}

function isUuid(value: string): boolean {
  return uuidFormat.safeParse(value).success;
}

/** An id from a hidden input, or null when it is not uuid-shaped. */
function idField(formData: FormData, name: string): string | null {
  const value = textField(formData, name).trim();
  return isUuid(value) ? value : null;
}

type FieldResult<T> = { readonly ok: true; readonly value: T } | { readonly ok: false; readonly refusal: FormParseResult<never> };

function parseName(raw: string): FieldResult<string> {
  const name = cleanLine(raw);
  if (name === "") return { ok: false, refusal: refuse(PATIENT_NAME_FIELD, PATIENT_NAME_MISSING_MESSAGE) };
  if (name.length > PATIENT_NAME_MAX_LENGTH) {
    return { ok: false, refusal: refuse(PATIENT_NAME_FIELD, PATIENT_NAME_TOO_LONG_MESSAGE) };
  }
  return { ok: true, value: name };
}

/**
 * Reads a PhoneField-style pair (number + country) and returns E.164, or null for a blank optional number. A refusal
 * names whichever of the two inputs it is about, so the form can mark the right one.
 */
function parsePhonePair(
  formData: FormData,
  numberField: string,
  countryField: string,
  missingMessage: string | null,
): FieldResult<string | null> {
  const result = parsePhoneEntry(
    { country: textField(formData, countryField), number: textField(formData, numberField) },
    missingMessage,
  );
  if (result.success) return { ok: true, value: result.e164 };
  return { ok: false, refusal: refuse(result.part === "country" ? countryField : numberField, result.message) };
}

/**
 * Splits the one comma-separated tags input into clean tags: each is a single line with inner whitespace collapsed;
 * blanks are dropped; repeats are dropped case-insensitively, keeping the first spelling typed. The count is checked
 * before the lengths, so a long paste gets the more useful "Up to 5 tags." first.
 */
function parseTags(raw: string): FieldResult<readonly string[]> {
  const tags: string[] = [];
  const seen = new Set<string>();
  for (const part of raw.split(",")) {
    const tag = cleanLine(part).replace(WHITESPACE_RUN, " ");
    if (tag === "") continue;
    const key = tag.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    tags.push(tag);
  }
  if (tags.length > PATIENT_TAGS_MAX) return { ok: false, refusal: refuse(PATIENT_TAGS_FIELD, TOO_MANY_TAGS_MESSAGE) };
  const tooLong = tags.find((tag) => tag.length > PATIENT_TAG_MAX_LENGTH);
  if (tooLong !== undefined) return { ok: false, refusal: refuse(PATIENT_TAGS_FIELD, tagTooLongMessage(tooLong)) };
  return { ok: true, value: tags };
}

export interface PatientEditCommand {
  readonly patientId: string;
  readonly name: string;
  /** E.164, or null to clear it. Whether it differs from the patient's own phone is checked by the action, which
   * knows that phone; the database refuses it too. */
  readonly altPhone: string | null;
  readonly tags: readonly string[];
}

/** The profile's Edit form: name (required), an optional second phone, and tags. */
export function parsePatientEdit(formData: FormData): FormParseResult<PatientEditCommand> {
  const patientId = idField(formData, PATIENT_ID_FIELD);
  if (patientId === null) return NOT_FOUND_RESULT;

  const name = parseName(textField(formData, PATIENT_NAME_FIELD));
  if (!name.ok) return name.refusal;

  const altPhone = parsePhonePair(formData, ALT_PHONE_FIELD, ALT_PHONE_COUNTRY_FIELD, null);
  if (!altPhone.ok) return altPhone.refusal;

  const tags = parseTags(textField(formData, PATIENT_TAGS_FIELD));
  if (!tags.ok) return tags.refusal;

  return { success: true, data: { patientId, name: name.value, altPhone: altPhone.value, tags: tags.value } };
}

/** Cuts to `max` code units without leaving half of a surrogate pair (an emoji) at the end. */
function capLength(value: string, max: number): string {
  if (value.length <= max) return value;
  const cut = value.slice(0, max);
  return HIGH_SURROGATE_AT_END.test(cut) ? cut.slice(0, -1) : cut;
}

/** The list page's search box (a GET parameter): one clean line, cut to the limit rather than refused, "" when
 * absent. Never an error: a search that matches nothing simply lists nothing. */
export function parsePatientSearch(raw: string | undefined): string {
  if (raw === undefined) return "";
  return capLength(cleanLine(raw), PATIENT_SEARCH_MAX_LENGTH).trim();
}

/** The digits of a search, for matching anywhere inside stored phone numbers; null when there are fewer than 3, so
 * a name like "Ravi 2" is not also read as a phone search that matches most of the register. */
export function searchDigits(query: string): string | null {
  const digits = query.replace(NON_DIGITS, "");
  return digits.length >= SEARCH_DIGITS_MIN ? digits : null;
}

export interface MergeLookupCommand {
  /** The patient whose profile the merge starts from; they stay. */
  readonly keepId: string;
  /** E.164 of the other record, to look up. */
  readonly phone: string;
}

/** Merge, step one: the other record is found by its phone, typed like any PhoneField. */
export function parseMergeLookup(formData: FormData): FormParseResult<MergeLookupCommand> {
  const keepId = idField(formData, MERGE_KEEP_ID_FIELD);
  if (keepId === null) return NOT_FOUND_RESULT;

  const phone = parsePhonePair(formData, PATIENT_PHONE_FIELD, PHONE_COUNTRY_FIELD, MERGE_PHONE_MISSING_MESSAGE);
  if (!phone.ok) return phone.refusal;
  // parsePhoneEntry only returns null for a blank number when no missing message is given.
  if (phone.value === null) return refuse(PATIENT_PHONE_FIELD, MERGE_PHONE_MISSING_MESSAGE);

  return { success: true, data: { keepId, phone: phone.value } };
}

export interface MergeConfirmCommand {
  readonly keepId: string;
  /** The record whose bookings move to `keepId` and which is then removed. */
  readonly removeId: string;
}

/** Merge, step two: both ids come from hidden inputs; a record cannot be merged into itself. */
export function parseMergeConfirm(formData: FormData): FormParseResult<MergeConfirmCommand> {
  const keepId = idField(formData, MERGE_KEEP_ID_FIELD);
  const removeId = idField(formData, MERGE_REMOVE_ID_FIELD);
  if (keepId === null || removeId === null) return NOT_FOUND_RESULT;
  if (keepId.toLowerCase() === removeId.toLowerCase()) return refuse(null, MERGE_SAME_PATIENT_MESSAGE);
  return { success: true, data: { keepId, removeId } };
}

export interface ErasePatientCommand {
  readonly patientId: string;
}

/** Delete patient's confirm step. */
export function parseErasePatient(formData: FormData): FormParseResult<ErasePatientCommand> {
  const patientId = idField(formData, PATIENT_ID_FIELD);
  if (patientId === null) return NOT_FOUND_RESULT;
  return { success: true, data: { patientId } };
}

/** Who a hand-added booking is for: a patient already in the register (Book again), or someone new, whom the
 * database links to an existing record by phone or creates. */
export type ManualBookingPatient =
  | { readonly kind: "existing"; readonly patientId: string }
  | { readonly kind: "new"; readonly name: string; readonly phone: string };

export interface ManualBookingCommand {
  readonly date: string; // YYYY-MM-DD
  readonly start: string; // HH:MM
  /** A doctor's id, or null for any doctor. Only its shape is checked; the action checks it is this clinic's. */
  readonly practitionerId: string | null;
  readonly serviceId: string | null;
  readonly patient: ManualBookingPatient;
}

/**
 * Reception's Add booking form. The slot comes first because it is what reception picked first; the patient is
 * either a hidden patientId (Book again, where name and phone are shown read-only and not posted) or name + phone.
 */
export function parseManualBooking(formData: FormData): FormParseResult<ManualBookingCommand> {
  const date = textField(formData, BOOKING_DATE_FIELD).trim();
  if (!isIsoDate(date)) return refuse(BOOKING_DATE_FIELD, CHOOSE_DAY_MESSAGE);

  const start = textField(formData, BOOKING_START_FIELD).trim();
  if (!START_TIME.test(start)) return refuse(BOOKING_START_FIELD, CHOOSE_TIME_MESSAGE);

  const doctor = textField(formData, BOOKING_DOCTOR_FIELD).trim();
  if (doctor !== ANY_DOCTOR && !isUuid(doctor)) return refuse(BOOKING_DOCTOR_FIELD, CHOOSE_DOCTOR_MESSAGE);
  const practitionerId = doctor === ANY_DOCTOR ? null : doctor;

  const service = textField(formData, BOOKING_SERVICE_FIELD).trim();
  if (service !== "" && !isUuid(service)) return refuse(BOOKING_SERVICE_FIELD, CHOOSE_SERVICE_MESSAGE);
  const serviceId = service === "" ? null : service;

  const rawPatientId = textField(formData, PATIENT_ID_FIELD).trim();
  if (rawPatientId !== "") {
    if (!isUuid(rawPatientId)) return NOT_FOUND_RESULT;
    return {
      success: true,
      data: { date, start, practitionerId, serviceId, patient: { kind: "existing", patientId: rawPatientId } },
    };
  }

  const name = parseName(textField(formData, PATIENT_NAME_FIELD));
  if (!name.ok) return name.refusal;

  const phone = parsePhonePair(formData, PATIENT_PHONE_FIELD, PHONE_COUNTRY_FIELD, BOOKING_PHONE_MISSING_MESSAGE);
  if (!phone.ok) return phone.refusal;
  if (phone.value === null) return refuse(PATIENT_PHONE_FIELD, BOOKING_PHONE_MISSING_MESSAGE);

  return {
    success: true,
    data: { date, start, practitionerId, serviceId, patient: { kind: "new", name: name.value, phone: phone.value } },
  };
}
