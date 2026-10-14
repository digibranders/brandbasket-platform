/**
 * The href to render for a link someone outside the team typed, or null to show it as plain text. Only https links
 * are clickable, whatever the stored value says: older rows, or rows written by a future path that skipped the form
 * checks, must not be able to put `javascript:` or another scheme into a staff or customer page.
 */
export function safeExternalHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

/**
 * The href for a business's own website as its owner gave it, or null. Unlike safeExternalHref this lets plain http
 * through: plenty of small businesses' sites have no certificate, and the link opens in the visitor's own browser.
 */
export function safeWebsiteHref(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:" ? url.href : null;
  } catch {
    return null;
  }
}
