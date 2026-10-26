import { TEAMS_URL_PROBLEMS } from "@brandbasket/shared/lib/teams-webhook";
import { describe, expect, it } from "vitest";
import { readSettingsNotice, SETTINGS_NOTICES, settingsNoticeHref } from "./settings-notices";

describe("settings notices", () => {
  it("has a plain sentence for every Teams address problem, and none that shows a dash", () => {
    for (const key of Object.keys(TEAMS_URL_PROBLEMS)) expect(SETTINGS_NOTICES[key as keyof typeof SETTINGS_NOTICES].ok).toBe(false);
    expect(JSON.stringify(SETTINGS_NOTICES)).not.toMatch(new RegExp("[\\u2013\\u2014]"));
  });

  it("sends Teams notices back to the Teams section and others to the page", () => {
    expect(settingsNoticeHref("teams-saved")).toBe("/settings?saved=teams-saved#teams");
    expect(settingsNoticeHref("setup-call-saved")).toBe("/settings?saved=setup-call-saved");
  });

  it("reads only notices it knows", () => {
    expect(readSettingsNotice("teams-test-sent")).toBe("teams-test-sent");
    expect(readSettingsNotice("teams-hack")).toBeNull();
    expect(readSettingsNotice(["teams-saved"])).toBeNull();
  });
});
