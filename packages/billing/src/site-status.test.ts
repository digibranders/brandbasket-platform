import { describe, expect, it } from "vitest";
import type { ProjectStatus } from "@firstfold/db";
import { deriveSiteStatus } from "./site-status";

const NOW = new Date("2026-09-17T12:00:00Z");
const FUTURE = new Date("2026-10-17T12:00:00Z");
const PAST = new Date("2026-09-01T12:00:00Z");

describe("deriveSiteStatus", () => {
  it("is 'not_launched' before the project has gone live, whatever billing says", () => {
    const statuses: readonly ProjectStatus[] = ["onboarding", "submitted", "building", "preview", "revisions", "approved"];
    for (const projectStatus of statuses) {
      expect(
        deriveSiteStatus({ projectStatus, subscription: { status: "active", paidThroughAt: FUTURE } }, NOW),
      ).toEqual({ kind: "not_launched" });
    }
  });

  it("is 'online' once live and billing access holds", () => {
    expect(
      deriveSiteStatus({ projectStatus: "live", subscription: { status: "active", paidThroughAt: FUTURE } }, NOW),
    ).toEqual({ kind: "online" });
  });

  it("is 'offline' once live if billing access has lapsed", () => {
    expect(
      deriveSiteStatus({ projectStatus: "live", subscription: { status: "inactive", paidThroughAt: FUTURE } }, NOW),
    ).toEqual({ kind: "offline", reason: "payment_lapsed" });

    expect(
      deriveSiteStatus({ projectStatus: "live", subscription: { status: "active", paidThroughAt: PAST } }, NOW),
    ).toEqual({ kind: "offline", reason: "payment_lapsed" });
  });

  it("reports 'payment_lapsed' even when there is no subscription at all", () => {
    expect(deriveSiteStatus({ projectStatus: "live", subscription: null }, NOW)).toEqual({
      kind: "offline",
      reason: "payment_lapsed",
    });
  });

  it("is 'not_launched' for on_hold and cancelled too: both only ever happen pre-live (spec §5.3)", () => {
    for (const projectStatus of ["on_hold", "cancelled"] as const) {
      expect(
        deriveSiteStatus({ projectStatus, subscription: { status: "active", paidThroughAt: FUTURE } }, NOW),
      ).toEqual({ kind: "not_launched" });
    }
  });
});
