import { describe, expect, it } from "vitest";
import { parseHostingForm } from "./hosting-form";

describe("parseHostingForm", () => {
  it("accepts a project id with and without a team id", () => {
    expect(parseHostingForm("prj_abc123", "team_xyz789")).toEqual({ success: true, vercelProjectId: "prj_abc123", vercelTeamId: "team_xyz789" });
    expect(parseHostingForm("prj_abc123", "")).toEqual({ success: true, vercelProjectId: "prj_abc123", vercelTeamId: null });
  });

  it("trims what was pasted", () => {
    expect(parseHostingForm("  prj_abc123 ", " team_xyz789\n")).toEqual({ success: true, vercelProjectId: "prj_abc123", vercelTeamId: "team_xyz789" });
  });

  it("refuses an empty project id: there is no way to clear it from here", () => {
    expect(parseHostingForm("", "team_xyz789").success).toBe(false);
    expect(parseHostingForm(null, null).success).toBe(false);
  });

  it("refuses a project name or address in place of the id", () => {
    expect(parseHostingForm("my-site", null).success).toBe(false);
    expect(parseHostingForm("https://my-site.vercel.app", null).success).toBe(false);
  });

  it("refuses a team that is not a team id", () => {
    expect(parseHostingForm("prj_abc123", "digibranders").success).toBe(false);
  });

  it("refuses an id that is too long", () => {
    expect(parseHostingForm(`prj_${"a".repeat(80)}`, null).success).toBe(false);
  });
});
