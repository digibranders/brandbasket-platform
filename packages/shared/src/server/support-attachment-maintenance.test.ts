import { describe, expect, it, vi } from "vitest";
import { purgeSupportAttachments } from "./support-attachment-maintenance";
vi.mock("server-only", () => ({}));
it("retains deleting metadata for retries when private storage fails", async () => {
  const markPurged = vi.fn();
  const error = new Error("offline");
  const onError = vi.fn();
  expect(
    await purgeSupportAttachments(
      {
        storage: {
          put: vi.fn(),
          get: vi.fn(),
          delete: async () => {
            throw error;
          },
        },
        markPurged,
        onError,
      },
      [{ id: "id", storageKey: "key" }],
    ),
  ).toEqual({ purged: 0, failed: 1 });
  expect(markPurged).not.toHaveBeenCalled();
  expect(onError).toHaveBeenCalledWith("id", error);
});
it("marks purged only after storage deletion succeeds", async () => {
  const events: string[] = [];
  await purgeSupportAttachments(
    {
      storage: {
        put: vi.fn(),
        get: vi.fn(),
        delete: async () => {
          events.push("storage");
        },
      },
      markPurged: async () => {
        events.push("db");
      },
      onError: vi.fn(),
    },
    [{ id: "id", storageKey: "key" }],
  );
  expect(events).toEqual(["storage", "db"]);
});
