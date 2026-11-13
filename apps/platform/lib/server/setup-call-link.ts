import "server-only";
import { findSiteSetting } from "@brandbasket/db";
import { readSetupCallUrl, SETUP_CALL_URL_KEY } from "@brandbasket/shared/lib/setup-call-link";
import { getStaffDb } from "./db";

/**
 * The link to book a call about setting up the website, as staff set it in the console, or null when there is none. It is
 * read on every page that shows it, so a change in the console is on the dashboard at once. Anything that cannot be read or
 * is not a safe address (the value is checked again here, whatever was saved) is treated as no link. A failed read throws,
 * so the caller shows its error state rather than a page that looks as if staff had set no link.
 */
export async function getSetupCallUrl(): Promise<string | null> {
  const setting = await findSiteSetting(getStaffDb(), SETUP_CALL_URL_KEY);
  if (setting === null) return null;
  const reading = readSetupCallUrl(setting.value);
  return reading.ok ? reading.url : null;
}
