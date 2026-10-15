import "server-only";
import { findSiteSetting } from "@fynix/db";
import { readSetupCallUrl, SETUP_CALL_URL_KEY } from "@fynix/shared/lib/setup-call-link";
import { errorLogInfo } from "@fynix/shared/server/error-log-info";
import { getStaffDb } from "./db";

/**
 * The link to book a call about setting up the website, as staff set it in the console, or null when there is none. It is
 * read on every page that shows it, so a change in the console is on the dashboard at once. Anything that cannot be read or
 * is not a safe address (the value is checked again here, whatever was saved) is treated as no link: the dashboard then shows
 * no call card, and the steps below it carry on as before. A failure to read it never breaks the setup page.
 */
export async function getSetupCallUrl(): Promise<string | null> {
  try {
    const setting = await findSiteSetting(getStaffDb(), SETUP_CALL_URL_KEY);
    if (setting === null) return null;
    const reading = readSetupCallUrl(setting.value);
    return reading.ok ? reading.url : null;
  } catch (error) {
    console.error("[setup-call-link] could not read the setting", errorLogInfo(error));
    return null;
  }
}
