import "server-only";
import { after } from "next/server";
import type { DirectoryRef } from "@brandbasket/db";
import { errorLogInfo } from "@brandbasket/shared/server/error-log-info";
import { DIRECTORY_REFRESH_PATH, type DirectoryRefreshRequest } from "@/lib/directory-api";
import { leadsApiToken } from "./website-api-auth";
import { websiteOrigin } from "./website-origin";

/** The website answers at once; this only keeps a slow or lost website from holding up anything. */
const REFRESH_TIMEOUT_MS = 5000;

/** What the website calls a business: its permanent id, or its listing key when it has none (the cache tag's id). */
export function websiteIdOf(business: DirectoryRef): string {
  return business.placeId ?? business.listingKey;
}

/**
 * Tells the website a business's page changed (an owner answered a review), so it stops serving what it kept
 * (lib/directory-api.ts, DIRECTORY_REFRESH_PATH). Never throws: if the website cannot be told, its page simply catches up
 * within the 15 minutes it keeps things for, and nothing the owner did is lost.
 */
export async function refreshWebsiteBusiness(business: DirectoryRef): Promise<void> {
  const token = leadsApiToken();
  if (token === null) return;
  const body: DirectoryRefreshRequest = { id: websiteIdOf(business) };
  try {
    const response = await fetch(new URL(DIRECTORY_REFRESH_PATH, websiteOrigin()), {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "error",
      signal: AbortSignal.timeout(REFRESH_TIMEOUT_MS),
    });
    if (!response.ok) console.error("The website would not refresh a business's page.", { status: response.status });
  } catch (error) {
    console.error("Could not tell the website a business's page changed.", errorLogInfo(error));
  }
}

/**
 * Does the telling once the response has gone, so the owner never waits on the website. Never throws: the owner's change
 * is already saved, and telling the website is only a courtesy to its visitors.
 */
export function scheduleWebsiteRefresh(business: DirectoryRef): void {
  try {
    after(() => refreshWebsiteBusiness(business));
  } catch {
    // Not inside a request (`after` has nothing to run after): tell it now, without waiting.
    void refreshWebsiteBusiness(business);
  }
}
