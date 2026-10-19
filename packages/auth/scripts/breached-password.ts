import { createHash } from "node:crypto";

const RANGE_URL = "https://api.pwnedpasswords.com/range/";
const TIMEOUT_MS = 10_000;

/** The breach service could not be asked, so nothing is known about the password. It is never read as "not breached". */
export class BreachCheckUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BreachCheckUnavailableError";
  }
}

/**
 * How many times `password` appears in known data breaches (Have I Been Pwned's Pwned Passwords). Only the first five
 * characters of the password's SHA-1 hash are sent; the service answers with every hash that starts with them and the
 * match is made here, so neither the password nor its full hash leaves this machine. Padding rows (count 0) are
 * ignored.
 */
export async function breachedPasswordCount(password: string, fetchFn: typeof fetch = fetch): Promise<number> {
  const hash = createHash("sha1").update(password, "utf8").digest("hex").toUpperCase();
  const prefix = hash.slice(0, 5);
  const suffix = hash.slice(5);

  let response: Response;
  try {
    response = await fetchFn(`${RANGE_URL}${prefix}`, {
      headers: { "Add-Padding": "true", "User-Agent": "brandbasket-staff-create" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    throw new BreachCheckUnavailableError("Could not reach the breached-password service. Check the connection and try again.");
  }
  if (!response.ok) {
    throw new BreachCheckUnavailableError(`The breached-password service answered HTTP ${response.status}. Try again in a minute.`);
  }

  for (const line of (await response.text()).split(/\r?\n/)) {
    const [candidate, count] = line.split(":");
    if (candidate?.trim().toUpperCase() === suffix) return Number(count?.trim() ?? "0");
  }
  return 0;
}
