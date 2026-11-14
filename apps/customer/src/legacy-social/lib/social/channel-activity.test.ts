import { describe, expect, it } from "vitest";
import type { SiteJob } from "./ai";
import { channelActivity, isReady, jobChannels, loadSeen, markSeen } from "./channel-activity";

const job = (extra: Partial<SiteJob>): SiteJob => ({ id: "j", kind: "write", state: "running", createdAt: "2026-11-14T10:00:00Z", ...extra });
const connected = ["instagram", "facebook", "linkedin"] as const;
const none = (): undefined => undefined;

describe("jobChannels", () => {
  it("uses the channels the job names, then those of its batch, then every connected one", () => {
    expect(jobChannels(job({ networks: ["facebook"] }), connected, none)).toEqual(["facebook"]);
    expect(jobChannels(job({ kind: "draw", batchId: "b1" }), connected, () => ["instagram", "linkedin"])).toEqual(["instagram", "linkedin"]);
    expect(jobChannels(job({}), connected, none)).toEqual(["instagram", "facebook", "linkedin"]);
  });

  it("leaves out a channel that is not connected", () => {
    expect(jobChannels(job({ networks: ["facebook", "google"] }), connected, none)).toEqual(["facebook"]);
  });
});

describe("channelActivity", () => {
  it("marks the channels being worked on, and when the newest finished work ended", () => {
    const activity = channelActivity(
      [job({ networks: ["linkedin"] }), job({ id: "k", state: "done", networks: ["facebook"], finishedAt: "2026-11-14T10:05:00Z" }), job({ id: "l", state: "done", networks: ["facebook"], finishedAt: "2026-11-14T10:09:00Z" }), job({ id: "m", kind: "replace", state: "running" })],
      connected,
      none,
    );
    expect([...activity.working]).toEqual(["linkedin"]);
    expect(activity.doneAt).toEqual({ facebook: "2026-11-14T10:09:00Z" });
  });

  it("does not count a failed job as finished work", () => {
    expect(channelActivity([job({ state: "failed", networks: ["facebook"], finishedAt: "2026-11-14T10:05:00Z" })], connected, none).doneAt).toEqual({});
  });
});

describe("isReady", () => {
  const activity = channelActivity([job({ state: "done", networks: ["facebook"], finishedAt: "2026-11-14T10:05:00Z" })], connected, none);

  it("is ready when work ended after she last looked, and not before the first visit", () => {
    expect(isReady(activity, { baselineAt: "2026-11-14T10:00:00Z", seen: {} }, "facebook")).toBe(true);
    expect(isReady(activity, { baselineAt: "2026-11-14T10:30:00Z", seen: {} }, "facebook")).toBe(false);
    expect(isReady(activity, { baselineAt: "2026-11-14T10:00:00Z", seen: { facebook: "2026-11-14T10:06:00Z" } }, "facebook")).toBe(false);
    expect(isReady(activity, null, "facebook")).toBe(false);
  });

  it("is not ready while the channel is being worked on again", () => {
    const again = channelActivity([job({ networks: ["facebook"] }), job({ id: "k", state: "done", networks: ["facebook"], finishedAt: "2026-11-14T10:05:00Z" })], connected, none);
    expect(isReady(again, { baselineAt: "2026-11-14T10:00:00Z", seen: {} }, "facebook")).toBe(false);
  });
});

describe("the saved record", () => {
  const memory = (): Pick<Storage, "getItem" | "setItem"> & { data: Map<string, string> } => {
    const data = new Map<string, string>();
    return { data, getItem: (k) => data.get(k) ?? null, setItem: (k, v) => void data.set(k, v) };
  };

  it("starts at the first visit, keeps it, and notes what she looked at", () => {
    const storage = memory();
    const first = loadSeen("b1", new Date("2026-11-14T10:00:00Z"), storage);
    expect(first?.baselineAt).toBe("2026-11-14T10:00:00.000Z");
    expect(loadSeen("b1", new Date("2026-11-14T11:00:00Z"), storage)?.baselineAt).toBe("2026-11-14T10:00:00.000Z");
    const looked = markSeen("b1", first as NonNullable<typeof first>, "facebook", new Date("2026-11-14T10:20:00Z"), storage);
    expect(looked.seen.facebook).toBe("2026-11-14T10:20:00.000Z");
    expect(loadSeen("b1", new Date(), storage)?.seen.facebook).toBe("2026-11-14T10:20:00.000Z");
  });

  it("keeps nothing and says so when the browser has no storage", () => {
    expect(loadSeen("b1", new Date(), undefined)).toBeNull();
  });
});
