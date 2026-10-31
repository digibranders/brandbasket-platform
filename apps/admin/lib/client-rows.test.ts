import type { ClientBilling, ClientProject } from "@brandbasket/db";
import { describe, expect, it } from "vitest";
import { STAFF_STAGE_LABELS, type StaffStage } from "@brandbasket/shared/lib/project-stage";
import {
  BUILD_STAGES,
  buildStageLabel,
  CLIENT_ROW_STAGE_LABELS,
  clientBuildStage,
  clientRowStage,
  filterClientRows,
  parseBuildStage,
  servicesByBusiness,
  type ClientRowStage,
} from "./client-rows";

const PAID: ClientBilling = {
  subscription: null,
  firstPayment: { amountCents: 299_900, currency: "INR", provider: "fake", paidAt: new Date("2026-11-17T09:00:00.000Z"), manual: null },
};
const NOT_PAID: ClientBilling = { subscription: null, firstPayment: null };

function project(status: ClientProject["status"]): ClientProject {
  return {
    id: "01a0f71b-8402-7d48-a90a-207e8c8a0001",
    status,
    onboardingSubmittedAt: null,
    slaDueAt: null,
    previewUrl: null,
    previewSentAt: null,
    revisionRoundsGranted: 0,
    launchedAt: null,
    createdAt: new Date("2026-11-17T09:00:00.000Z"),
  };
}

describe("clientRowStage", () => {
  it("puts leaving first, then not paid, then the build stage", () => {
    expect(clientRowStage({ project: project("live"), billing: PAID }, true)).toBe("leaving");
    expect(clientRowStage({ project: project("onboarding"), billing: NOT_PAID }, false)).toBe("not-paid");
    expect(clientRowStage({ project: null, billing: PAID }, false)).toBe("setup");
    expect(clientRowStage({ project: project("live"), billing: PAID }, false)).toBe("live");
  });

  it("has a label for every stage", () => {
    expect(CLIENT_ROW_STAGE_LABELS["not-paid"]).toBe("Not paid");
    expect(CLIENT_ROW_STAGE_LABELS.leaving).toBe("Leaving");
  });
});

describe("servicesByBusiness", () => {
  it("lists each business's services in catalogue order and adds up only active lines as the monthly amount", () => {
    const map = servicesByBusiness([
      { businessId: "a", addOn: "local-seo-aeo", netAmountCents: 2_499_900, status: "active" },
      { businessId: "a", addOn: "managed-website", netAmountCents: 299_900, status: "active" },
      { businessId: "a", addOn: "digital-growth", netAmountCents: 999_900, status: "pending" },
      { businessId: "b", addOn: "managed-website", netAmountCents: 299_900, status: "pending" },
    ]);
    expect(map.get("a")).toEqual({ addOns: ["managed-website", "digital-growth", "local-seo-aeo"], monthlyCents: 2_799_800 });
    expect(map.get("b")).toEqual({ addOns: ["managed-website"], monthlyCents: 0 });
    expect(map.get("c")).toBeUndefined();
  });
});

describe("clientBuildStage", () => {
  it("names the website build stage of the client's project, and is null without a project", () => {
    expect(clientBuildStage({ project: null })).toBeNull();
    expect(clientBuildStage({ project: project("onboarding") })).toBe("waiting_for_kickoff");
    expect(clientBuildStage({ project: project("submitted") })).toBe("ready_to_start");
    expect(clientBuildStage({ project: project("building") })).toBe("building");
  });
});

describe("buildStageLabel", () => {
  it("looks up the staff label, and is null without a stage", () => {
    expect(buildStageLabel(null)).toBeNull();
    expect(buildStageLabel("ready_to_start")).toBe("Ready to start");
    expect(buildStageLabel("changes_requested")).toBe(STAFF_STAGE_LABELS.changes_requested);
  });
});

describe("parseBuildStage", () => {
  it("accepts each staff stage key and reads anything else as all (null)", () => {
    expect(parseBuildStage("building")).toBe("building");
    expect(parseBuildStage("waiting_for_kickoff")).toBe("waiting_for_kickoff");
    expect(parseBuildStage("all")).toBeNull();
    expect(parseBuildStage("")).toBeNull();
    expect(parseBuildStage(undefined)).toBeNull();
    expect(parseBuildStage("Building")).toBeNull();
    expect(parseBuildStage("constructor")).toBeNull();
  });
});

describe("BUILD_STAGES", () => {
  it("lists every staff stage in the label order", () => {
    expect(BUILD_STAGES).toEqual(Object.keys(STAFF_STAGE_LABELS));
    expect(BUILD_STAGES).toHaveLength(9);
  });
});

describe("filterClientRows", () => {
  type Row = { readonly id: string; readonly stage: ClientRowStage; readonly buildStage: StaffStage | null };
  const ROWS: readonly Row[] = [
    { id: "a", stage: "live", buildStage: "live" },
    { id: "b", stage: "building", buildStage: "building" },
    { id: "c", stage: "setup", buildStage: null },
    { id: "d", stage: "building", buildStage: "approved" },
    { id: "e", stage: "not-paid", buildStage: "waiting_for_kickoff" },
  ];
  const ids = (rows: readonly Row[]): string[] => rows.map((row) => row.id);

  it("keeps every row when neither filter is set", () => {
    expect(ids(filterClientRows(ROWS, { stage: null, build: null }))).toEqual(["a", "b", "c", "d", "e"]);
  });

  it("keeps only rows whose project has the build stage, and excludes clients without a project", () => {
    expect(ids(filterClientRows(ROWS, { stage: null, build: "building" }))).toEqual(["b"]);
    expect(ids(filterClientRows(ROWS, { stage: null, build: "cancelled" }))).toEqual([]);
  });

  it("combines with the row stage filter", () => {
    expect(ids(filterClientRows(ROWS, { stage: "building", build: "building" }))).toEqual(["b"]);
    expect(ids(filterClientRows(ROWS, { stage: "building", build: "approved" }))).toEqual(["d"]);
    expect(ids(filterClientRows(ROWS, { stage: "live", build: "building" }))).toEqual([]);
    expect(ids(filterClientRows(ROWS, { stage: "setup", build: null }))).toEqual(["c"]);
  });
});
