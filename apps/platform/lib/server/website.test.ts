import {
  findLatestProject,
  findPreviewImageInfo,
  findSetupCallBooking,
  getPrimaryDomain,
  listProjectEvents,
  withTenantScope,
  type Project,
} from "@brandbasket/db";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { getAppDb } from "./db";
import { readLiveWebsite } from "./onboarding";
import { loadWebsite } from "./website";

vi.mock("server-only", () => ({}));
vi.mock("./db", () => ({ getAppDb: vi.fn() }));
vi.mock("./onboarding", () => ({ readLiveWebsite: vi.fn() }));
vi.mock("@brandbasket/db", () => ({
  findLatestProject: vi.fn(),
  findPreviewImageInfo: vi.fn(),
  findSetupCallBooking: vi.fn(),
  getPrimaryDomain: vi.fn(),
  listProjectEvents: vi.fn(),
  withTenantScope: vi.fn(),
}));

const tx = { name: "tx" } as never;
const tenant = { userId: "user-a", businessId: "business-1", businessName: "Cafe", role: "owner" } as never;
const NOW = new Date("2026-10-27T06:00:00.000Z");

function project(over: Partial<Project> = {}): Project {
  return {
    id: "project-1",
    businessId: "business-1",
    kind: "website",
    status: "preview",
    onboardingSubmittedAt: new Date("2026-10-20T06:00:00.000Z"),
    slaDueAt: new Date("2026-10-22T06:00:00.000Z"),
    previewUrl: "https://preview.example",
    previewSentAt: new Date("2026-10-26T06:00:00.000Z"),
    onHoldReason: null,
    revisionRoundsIncluded: 2,
    revisionRoundsGranted: 0,
    launchedAt: null,
    createdAt: new Date("2026-10-19T06:00:00.000Z"),
    updatedAt: new Date("2026-10-26T06:00:00.000Z"),
    ...over,
  } as Project;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(getAppDb).mockReturnValue({} as never);
  vi.mocked(withTenantScope).mockImplementation(async (_db, _scope, work) => work(tx));
  vi.mocked(findLatestProject).mockResolvedValue(project());
  vi.mocked(getPrimaryDomain).mockResolvedValue(null);
  vi.mocked(readLiveWebsite).mockResolvedValue(null);
  vi.mocked(listProjectEvents).mockResolvedValue([]);
  vi.mocked(findSetupCallBooking).mockResolvedValue(null);
  vi.mocked(findPreviewImageInfo).mockResolvedValue(null);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

describe("loadWebsite", () => {
  it("gives kind none and no steps when the business has no project", async () => {
    vi.mocked(findLatestProject).mockResolvedValue(null);
    const data = await loadWebsite(tenant, NOW);
    expect(data.view.kind).toBe("none");
    expect(data.steps).toEqual([]);
    expect(data.pictureUrl).toBeNull();
    expect(listProjectEvents).not.toHaveBeenCalled();
  });

  it("gives kind live with the site's address for a live website", async () => {
    vi.mocked(findLatestProject).mockResolvedValue(project({ status: "live", launchedAt: new Date("2026-10-25T06:00:00.000Z") }));
    vi.mocked(readLiveWebsite).mockResolvedValue({ hostname: "cafe.example", launchedAt: new Date("2026-10-25T06:00:00.000Z") });
    const data = await loadWebsite(tenant, NOW);
    expect(data.view.kind).toBe("live");
    expect(data.live?.hostname).toBe("cafe.example");
  });

  it("passes the project's events oldest first, as the query returns them, to the timeline", async () => {
    vi.mocked(listProjectEvents).mockResolvedValue([
      { status: "submitted", reason: null, occurredAt: new Date("2026-10-20T06:00:00.000Z") },
      { status: "preview", reason: null, occurredAt: new Date("2026-10-26T06:00:00.000Z") },
    ]);
    const data = await loadWebsite(tenant, NOW);
    expect(listProjectEvents).toHaveBeenCalledWith(tx, "project-1");
    expect(data.events.map((event) => event.status)).toEqual(["submitted", "preview"]);
    expect(data.steps).toHaveLength(4);
  });

  it("gives the kickoff call's start to the timeline", async () => {
    vi.mocked(findSetupCallBooking).mockResolvedValue({ startsAt: new Date("2026-10-21T08:00:00.000Z") } as never);
    const data = await loadWebsite(tenant, NOW);
    expect(findSetupCallBooking).toHaveBeenCalledWith(tx, "business-1");
    expect(data.steps[0]?.when).toBe("Wed 21 Oct");
  });

  it("links the picture, versioned by when it was taken, when it was taken of the project's current link", async () => {
    const capturedAt = new Date("2026-10-26T07:00:00.000Z");
    vi.mocked(findPreviewImageInfo).mockResolvedValue({ previewUrl: "https://preview.example", capturedAt });
    const data = await loadWebsite(tenant, NOW);
    expect(data.pictureUrl).toBe(`/website/preview-image?v=${capturedAt.getTime()}`);
  });

  it("drops the picture when it was taken of a different link", async () => {
    vi.mocked(findPreviewImageInfo).mockResolvedValue({ previewUrl: "https://old.example", capturedAt: new Date("2026-10-24T07:00:00.000Z") });
    const data = await loadWebsite(tenant, NOW);
    expect(data.pictureUrl).toBeNull();
  });

  it("still shows the page, without the picture, when the picture cannot be read", async () => {
    vi.mocked(findPreviewImageInfo).mockRejectedValue(new Error("db down"));
    const data = await loadWebsite(tenant, NOW);
    expect(data.pictureUrl).toBeNull();
    expect(data.view.kind).toBe("preview");
    expect(data.steps).toHaveLength(4);
  });

  it("still shows the page, without the timeline, when the history cannot be read", async () => {
    vi.mocked(listProjectEvents).mockRejectedValue(new Error("db down"));
    const data = await loadWebsite(tenant, NOW);
    expect(data.steps).toEqual([]);
    expect(data.events).toEqual([]);
    expect(data.view.kind).toBe("preview");
  });

  it("fails when the project itself cannot be read", async () => {
    vi.mocked(findLatestProject).mockRejectedValue(new Error("db down"));
    await expect(loadWebsite(tenant, NOW)).rejects.toThrow("db down");
  });
});
