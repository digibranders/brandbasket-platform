"use client";

import { Button } from "@/ui";
import { COOKIE_SETTINGS_EVENT } from "./consent-banner";

/** Brings the measurement choice back, to turn it on or off. Ported from apps/platform components/consent/CookieSettingsButton.tsx. */
export function CookieSettingsButton() {
  return <Button onClick={() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))}>Change my choice</Button>;
}
