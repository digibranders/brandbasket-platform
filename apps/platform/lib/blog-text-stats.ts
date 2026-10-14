/**
 * Word count and reading time for the post editor's header, from the body's plain text (lexicalToPlainText).
 */

/** A common adult reading pace for web articles. */
const WORDS_PER_MINUTE = 200;

export function countWords(text: string): number {
  const trimmed = text.trim();
  return trimmed === "" ? 0 : trimmed.split(/\s+/).length;
}

/** Whole minutes, rounded up, and at least one for any post with words; zero for an empty post. */
export function readingMinutes(words: number): number {
  return words <= 0 ? 0 : Math.max(1, Math.ceil(words / WORDS_PER_MINUTE));
}
