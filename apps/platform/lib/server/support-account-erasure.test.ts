import type { DueClosure, ErasureOutcome } from "@fynix/db";
import { expect, it, vi } from "vitest";
import { eraseAccountWithPrivateSupport } from "./support-account-erasure";
vi.mock("server-only", () => ({}));
const closure: DueClosure = {
  id: "closure",
  userId: "user",
  businessId: "business",
  eraseAfter: new Date(0),
};
const erased: ErasureOutcome = {
  kind: "erased",
  closureId: "closure",
  userId: "user",
  businessId: "business",
  storageKeys: ["public-key"],
  vimeoIds: [],
};
it("retains the account and deletion manifest on storage failure, then erases on a successful retry", async () => {
  let state = "attached";
  let storageFails = true;
  const events: string[] = [];
  const deps = {
    findClosure: async () => closure,
    findBlock: async () => null,
    begin: async () => {
      state = "deleting";
      events.push("mark");
      return [{ id: "attachment", storageKey: "private-key" }];
    },
    purge: async () => {
      events.push("storage");
      if (storageFails) return { purged: 0, failed: 1 };
      state = "deleted";
      return { purged: 1, failed: 0 };
    },
    erase: vi.fn(async () => {
      expect(state).toBe("deleted");
      events.push("erase");
      return erased;
    }),
  };
  await expect(
    eraseAccountWithPrivateSupport(deps, "closure", new Date()),
  ).rejects.toThrow("private support screenshot");
  expect(state).toBe("deleting");
  expect(deps.erase).not.toHaveBeenCalled();
  storageFails = false;
  expect(
    await eraseAccountWithPrivateSupport(deps, "closure", new Date()),
  ).toEqual(erased);
  expect(events).toEqual(["mark", "storage", "mark", "storage", "erase"]);
});
it("does not mark or delete screenshots for an account that cannot be erased", async () => {
  const begin = vi.fn();
  const outcome = await eraseAccountWithPrivateSupport(
    {
      findClosure: async () => closure,
      findBlock: async () => "subscription-live",
      begin,
      purge: vi.fn(),
      erase: vi.fn(),
    },
    "closure",
    new Date(),
  );
  expect(outcome).toEqual({
    kind: "skipped",
    closureId: "closure",
    reason: "subscription-live",
  });
  expect(begin).not.toHaveBeenCalled();
});
it("purges nothing while an add-on blocks the account, then marks, purges and erases once the block clears", async () => {
  let block: "subscription-live" | null = "subscription-live";
  const events: string[] = [];
  const deps = {
    findClosure: async () => closure,
    findBlock: async () => {
      events.push("check");
      return block;
    },
    begin: async () => {
      events.push("mark");
      return [{ id: "attachment", storageKey: "private-key" }];
    },
    purge: async () => {
      events.push("storage");
      return { purged: 1, failed: 0 };
    },
    erase: vi.fn(async () => {
      events.push("erase");
      return erased;
    }),
  };
  expect(await eraseAccountWithPrivateSupport(deps, "closure", new Date())).toEqual({
    kind: "skipped",
    closureId: "closure",
    reason: "subscription-live",
  });
  expect(events).toEqual(["check"]);
  expect(deps.erase).not.toHaveBeenCalled();

  block = null;
  events.length = 0;
  expect(await eraseAccountWithPrivateSupport(deps, "closure", new Date())).toEqual(erased);
  expect(events).toEqual(["check", "mark", "storage", "erase"]);
});
