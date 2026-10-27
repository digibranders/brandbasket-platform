/** "%term%" for ILIKE, with `%`, `_` and `\` in the term matched as themselves. */
export function containsPattern(term: string): string {
  return `%${term.replace(/[\\%_]/g, (character) => `\\${character}`)}%`;
}
