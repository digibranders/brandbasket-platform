import { initialsOf } from "@brandbasket/shared/lib/names";

export interface AvatarTone {
  readonly background: string;
  readonly foreground: string;
}

/**
 * Eight muted, earthy tones that sit on cream without shouting. Every pair keeps white initials above 4.5:1.
 * Order matters only for stability: an id keeps its colour as long as this list keeps its length.
 */
export const AVATAR_TONES: readonly AvatarTone[] = [
  { background: "#8a4b2a", foreground: "#ffffff" },
  { background: "#3c5a4a", foreground: "#ffffff" },
  { background: "#6b3f7a", foreground: "#ffffff" },
  { background: "#2f5877", foreground: "#ffffff" },
  { background: "#855913", foreground: "#ffffff" },
  { background: "#7a2e3e", foreground: "#ffffff" },
  { background: "#4a6b2f", foreground: "#ffffff" },
  { background: "#5a4a3a", foreground: "#ffffff" },
];

/** One or two letters for a business or person. */
export function avatarInitials(name: string): string {
  return initialsOf(name);
}

/** FNV-1a: tiny, fast and well spread, which is all a colour pick needs. */
function hash(value: string): number {
  let result = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    result ^= value.charCodeAt(index);
    result = Math.imul(result, 0x01000193);
  }
  return result >>> 0;
}

/** The same id always gets the same colour, so a client is recognisable on every screen. */
export function avatarTone(id: string): AvatarTone {
  const tone = AVATAR_TONES[hash(id) % AVATAR_TONES.length];
  if (tone === undefined) throw new Error("Avatar palette is empty");
  return tone;
}
