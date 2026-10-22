import { describe, expect, it } from "vitest";
import type { ProjectStatus } from "@brandbasket/db";
import { deriveSiteStatus } from "./site-status";

describe("deriveSiteStatus", () => {
  it("is 'not_launched' before the project has gone live, whatever billing says", () => {
    const statuses: readonly ProjectStatus[] = ["onboarding", "submitted", "building", "preview", "revisions", "approved"];
    for (const projectStatus of statuses) {
      expect(deriveSiteStatus({ projectStatus, hasWebsite: true })).toEqual({ kind: "not_launched" });
    }
  });

  it("is 'online' once live and the Managed Website service is held", () => {
    expect(deriveSiteStatus({ projectStatus: "live", hasWebsite: true })).toEqual({ kind: "online" });
  });

  it("is 'offline' once live if the service is not held: payment lapsed, or no Managed Website line", () => {
    expect(deriveSiteStatus({ projectStatus: "live", hasWebsite: false })).toEqual({ kind: "offline", reason: "payment_lapsed" });
  });

  it("is 'not_launched' for on_hold and cancelled too: both only ever happen pre-live (spec §5.3)", () => {
    for (const projectStatus of ["on_hold", "cancelled"] as const) {
      expect(deriveSiteStatus({ projectStatus, hasWebsite: true })).toEqual({ kind: "not_launched" });
    }
  });
});
