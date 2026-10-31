"use client";

import type { ReactElement } from "react";
import { SOFT_BUTTON } from "@/components/v2/classes";
import { COOKIE_SETTINGS_EVENT } from "./ConsentBanner";

/** Brings the measurement choice back, to turn it on or off. */
export function CookieSettingsButton(): ReactElement {
  return (
    <button type="button" className={SOFT_BUTTON} onClick={() => window.dispatchEvent(new Event(COOKIE_SETTINGS_EVENT))}>
      Change my choice
    </button>
  );
}
