import { readFileSync } from "node:fs";
import { resolve } from "node:path";

/*
 * The seeded test accounts. Passwords are read at runtime from the workspace's local-test-logins.txt (never copied into
 * this repository). E2E_LOGINS_FILE points somewhere else when the file moves.
 */

export const ACCOUNTS = {
  "om-sweets": { email: "owner+om-sweets@example.test", label: "Om Sweets (kickoff stage)" },
  patel: { email: "owner+patel-tiffin-kitchen@example.test", label: "Patel Tiffin Kitchen (preview ready)" },
  kulkarni: { email: "owner+kulkarni-physio-wellness@example.test", label: "Kulkarni Physio & Wellness owner (live)" },
  "kulkarni-editor": { email: "editor+kulkarni-physio-wellness@example.test", label: "Kulkarni editor" },
  "kulkarni-viewer": { email: "viewer+kulkarni-physio-wellness@example.test", label: "Kulkarni viewer" },
  reddy: { email: "owner+reddy-driving-school@example.test", label: "Reddy Driving School (lapsed)" },
  chatterjee: { email: "owner+chatterjee-photo-studio@example.test", label: "Chatterjee Photo Studio (renewal failing)" },
  iyer: { email: "owner+iyer-filter-coffee-house@example.test", label: "Iyer Filter Coffee House (unpaid)" },
} as const;

export type AccountKey = keyof typeof ACCOUNTS;

export const ACCOUNT_KEYS = Object.keys(ACCOUNTS) as AccountKey[];

const LOGINS_FILE = process.env.E2E_LOGINS_FILE ?? resolve(__dirname, "../../../../../local-test-logins.txt");

let cache: string | null = null;

/** The password written after the account's email on its own line of the logins file. */
export function passwordFor(key: AccountKey): string {
  cache ??= readFileSync(LOGINS_FILE, "utf8");
  const email = ACCOUNTS[key].email;
  const line = cache.split("\n").find((candidate) => candidate.trim().startsWith(`${email} `));
  const password = line?.trim().split(/\s+/)[1];
  if (password === undefined) throw new Error(`No password for ${email} in ${LOGINS_FILE}.`);
  return password;
}

export const storageStatePath = (key: AccountKey): string => resolve(__dirname, ".auth", `${key}.json`);
