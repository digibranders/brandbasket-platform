/** Stored filenames are for the customer's reference only; this keeps a pasted path or a huge name out. */
export const MAX_FILE_NAME_LENGTH = 120;
const FALLBACK_FILE_NAME = "upload";
/**
 * Characters that are invisible or rearrange what is shown. Written only as escapes, so none of them sits in this
 * file itself:
 * - C0 and C1 controls: 0000-001F, 007F-009F
 * - the Arabic letter mark 061C, and the zero-width space, joiners and direction marks 200B-200F
 * - the line and paragraph separators 2028 and 2029
 * - bidirectional embeddings, overrides and isolates, which can make a name read backwards: 202A-202E, 2066-2069
 * - the word joiner and invisible operators 2060-2064
 * - the byte order mark FEFF, which is also a zero-width no-break space
 */
const INVISIBLE_CHARACTERS =
  /[\u0000-\u001F\u007F-\u009F\u061C\u200B-\u200F\u2028\u2029\u202A-\u202E\u2060-\u2064\u2066-\u2069\uFEFF]/g;

function decode(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

/**
 * The original file name from the upload's `X-File-Name` header: percent-decoded, reduced to its last path segment
 * with control and invisible characters removed, trimmed, and capped at 120 characters. Anything empty becomes "upload". The
 * result is only ever shown back to the customer; it never reaches a storage key, a URL or a response header.
 */
export function parseUploadFileName(header: string | null): string {
  if (header === null) return FALLBACK_FILE_NAME;
  const decoded = decode(header).replace(INVISIBLE_CHARACTERS, "");
  const base = decoded.slice(Math.max(decoded.lastIndexOf("/"), decoded.lastIndexOf("\\")) + 1).trim();
  // Counted in code points, so an emoji at the cut is never split in half.
  const capped = Array.from(base).slice(0, MAX_FILE_NAME_LENGTH).join("").trim();
  return capped === "" ? FALLBACK_FILE_NAME : capped;
}
