import { describe, expect, it } from "vitest";
import { jobLine, readJobs } from "./ai";

const write = (extra: Record<string, unknown>) => ({ id: "j1", kind: "write", state: "running", createdAt: "2026-11-14T10:00:00Z", ...extra });

describe("jobLine for a plan written week by week", () => {
  it("says nothing new until the first week is saved", () => {
    expect(jobLine({ kind: "write", state: "running", step: 2, weeksTotal: 4, weeksDone: 0 })).toBe("Writing your posts");
  });

  it("says how many weeks are ready while the rest is written", () => {
    expect(jobLine({ kind: "write", state: "running", step: 2, weeksTotal: 4, weeksDone: 1 })).toBe("Week 1 of 4 is ready to look at. Writing the rest");
    expect(jobLine({ kind: "write", state: "running", step: 2, weeksTotal: 4, weeksDone: 3 })).toBe("3 weeks of 4 are ready to look at. Writing the rest");
  });

  it("says what stays when a later week failed, and nothing special when no week was saved", () => {
    expect(jobLine({ kind: "write", state: "failed", weeksTotal: 4, weeksDone: 2, partial: true })).toBe("We wrote 2 of 4 weeks, and could not write the rest. What was written is saved. You can write the rest.");
    expect(jobLine({ kind: "write", state: "failed", weeksTotal: 4, weeksDone: 0 })).toBe("We could not write your posts. You can try again.");
  });

  it("is unchanged for a posting service that writes all at once", () => {
    expect(jobLine({ kind: "write", state: "running", step: 2 })).toBe("Writing your posts");
    expect(jobLine({ kind: "write", state: "done" })).toBe("Your posts are written and ready to look at.");
  });
});

describe("readJobs", () => {
  it("keeps the week counts and the partial mark when the posting service sends them", () => {
    const [job] = readJobs({ jobs: [write({ weeksTotal: 4, weeksDone: 1, batchId: "b1" })] });
    expect([job?.weeksTotal, job?.weeksDone, job?.batchId, job?.partial]).toEqual([4, 1, "b1", undefined]);
    const [failed] = readJobs({ jobs: [write({ state: "failed", weeksTotal: 4, weeksDone: 2, partial: true })] });
    expect(failed?.partial).toBe(true);
  });

  it("reads a job without them", () => {
    const [job] = readJobs({ jobs: [write({})] });
    expect([job?.weeksTotal, job?.weeksDone]).toEqual([undefined, undefined]);
  });
});
