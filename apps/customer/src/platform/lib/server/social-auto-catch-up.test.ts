// @vitest-environment node
import { describe, expect, it, vi } from "vitest";
import { runSocialAutoCatchUp, type SocialAutoCatchUpDeps } from "./social-auto-catch-up";
import type { SocialAutoDeps, SocialEvent } from "./social-auto-webhook";

vi.mock("server-only", () => ({}));

const BUSINESS = "0190a1b2-0000-7000-8000-000000000001";
const event = (id: string, seq: number, type = "post.failed"): SocialEvent => ({ id, type, seq, createdAt: "2026-11-23T09:59:00Z", data: { externalId: BUSINESS } });

function setup(overrides: Partial<SocialAutoCatchUpDeps> = {}, taken: readonly string[] = []) {
  const notify = vi.fn(async () => undefined);
  const record = vi.fn(async () => undefined);
  const save = vi.fn(async () => undefined);
  const read = vi.fn(async () => ({ events: [event("e1", 11), event("e2", 12)], hasMore: false }));
  const webhook: SocialAutoDeps = { secret: "s".repeat(32), taken: async (id) => taken.includes(id), resolveBusiness: async () => BUSINESS, notify, record };
  const deps: SocialAutoCatchUpDeps = { webhook, read, cursor: { read: async () => 10, save }, ...overrides };
  return { deps, notify, record, save, read };
}

describe("runSocialAutoCatchUp", () => {
  it("reads after the stored seq, sends each event once and saves the highest seq", async () => {
    const { deps, notify, save, read } = setup();
    expect(await runSocialAutoCatchUp(deps)).toEqual({ kind: "done", after: 10, handled: 2, duplicates: 0, ignored: 0, lastSeq: 12 });
    expect(read).toHaveBeenCalledWith(10, 100);
    expect(notify).toHaveBeenCalledTimes(2);
    expect(save).toHaveBeenCalledWith(12);
  });

  it("skips an event the webhook already took, and still moves the cursor past it", async () => {
    const { deps, notify, save } = setup({}, ["e1"]);
    expect(await runSocialAutoCatchUp(deps)).toMatchObject({ handled: 1, duplicates: 1, lastSeq: 12 });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(save).toHaveBeenCalledWith(12);
  });

  it("saves nothing when no new event came", async () => {
    const { deps, save } = setup({ read: async () => ({ events: [], hasMore: false }) });
    expect(await runSocialAutoCatchUp(deps)).toMatchObject({ kind: "done", handled: 0, lastSeq: 10 });
    expect(save).not.toHaveBeenCalled();
  });

  it("does nothing, and does not fail, when the webhook secret is not set", async () => {
    const { deps, read, save } = setup();
    expect(await runSocialAutoCatchUp({ ...deps, webhook: { ...deps.webhook, secret: null } })).toEqual({ kind: "skipped" });
    expect(read).not.toHaveBeenCalled();
    expect(save).not.toHaveBeenCalled();
  });

  it("does nothing, and does not fail, when social-auto's address is not set", async () => {
    const { deps, save } = setup();
    expect(await runSocialAutoCatchUp({ ...deps, read: null })).toEqual({ kind: "skipped" });
    expect(save).not.toHaveBeenCalled();
  });

  it("keeps the cursor where it was when social-auto cannot be read, and fails the run", async () => {
    const { deps, save } = setup({ read: async () => { throw new Error("down"); } });
    await expect(runSocialAutoCatchUp(deps)).rejects.toThrow("down");
    expect(save).not.toHaveBeenCalled();
  });
});
