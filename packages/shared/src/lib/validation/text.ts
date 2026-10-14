/**
 * ASCII control characters other than tab, line feed and carriage return, plus DEL. Written as escapes so the
 * source stays plain text: a raw NUL byte makes git treat the whole file as binary.
 */
const CONTROL_CHARACTERS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const LINE_BREAKS = /[\r\n]+/g;

/**
 * For single-line values. They can end up in email subjects and headers, so every control character,
 * line breaks included, is removed.
 */
export function cleanLine(value: string): string {
  return value.replace(LINE_BREAKS, " ").replace(CONTROL_CHARACTERS, "").trim();
}

/** For blocks of text: real line breaks survive, normalised to a line feed; other control characters do not. */
export function cleanMultiline(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(CONTROL_CHARACTERS, "").trim();
}
