import type { ClientSummary, ProjectStatus } from "@firstfold/db";
import { describe, expect, it } from "vitest";
import { clientsWaitingOnUs } from "./waiting-clients";

const NOW = new Date("2026-09-16T12:00:00Z");

function client(name: string, status: ProjectStatus | null, dueAt: string | null, joined = "2026-09-01T00:00:00Z"): ClientSummary {
  return {
    businessId: name,
    businessName: name,
    currency: "USD",
    tier: "premium",
    createdAt: new Date(joined),
    owner: null,
    project:
      status === null
        ? null
        : {
            id: `${name}-project`,
            status,
            onboardingSubmittedAt: null,
            slaDueAt: dueAt === null ? null : new Date(dueAt),
            previewUrl: null,
            previewSentAt: null,
            revisionRoundsGranted: 0,
            launchedAt: null,
            createdAt: new Date(joined),
          },
    billing: { subscription: null, firstPayment: null },
  };
}

describe("clientsWaitingOnUs", () => {
  it("keeps only clients whose next move is ours", () => {
    const result = clientsWaitingOnUs(
      [
        client("setting-up", "onboarding", null),
        client("sent", "submitted", "2026-09-17T10:00:00Z"),
        client("building", "building", "2026-09-18T10:00:00Z"),
        client("changes", "revisions", null),
        client("live", "live", null),
        client("paused", "on_hold", null),
        client("no-project", null, null),
      ],
      NOW,
    );
    expect(result.map((entry) => entry.client.businessName).sort()).toEqual(["building", "changes", "sent"]);
  });

  it("puts the earliest deadline first, overdue ones included", () => {
    const result = clientsWaitingOnUs(
      [
        client("later", "building", "2026-09-18T10:00:00Z"),
        client("overdue", "submitted", "2026-09-15T10:00:00Z"),
        client("soon", "submitted", "2026-09-16T18:00:00Z"),
      ],
      NOW,
    );
    expect(result.map((entry) => entry.client.businessName)).toEqual(["overdue", "soon", "later"]);
    expect(result.map((entry) => entry.overdue)).toEqual([true, false, false]);
  });

  it("puts clients without a deadline last, newest first", () => {
    const result = clientsWaitingOnUs(
      [
        client("old-no-date", "revisions", null, "2026-08-01T00:00:00Z"),
        client("dated", "submitted", "2026-09-20T10:00:00Z"),
        client("new-no-date", "revisions", null, "2026-09-10T00:00:00Z"),
      ],
      NOW,
    );
    expect(result.map((entry) => entry.client.businessName)).toEqual(["dated", "new-no-date", "old-no-date"]);
  });

  it("does not count a deadline at exactly now as overdue", () => {
    const [entry] = clientsWaitingOnUs([client("on-time", "submitted", NOW.toISOString())], NOW);
    expect(entry?.overdue).toBe(false);
  });
});
