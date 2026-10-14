import { describe, expect, it } from "vitest";
import { createDatabase } from "./client";

// Nothing listens on port 1, and none of these tests open a connection.
const UNREACHABLE_URL = "postgresql://nobody@127.0.0.1:1/none";

describe("createDatabase", () => {
  it("can be closed more than once", async () => {
    const handle = createDatabase(UNREACHABLE_URL);
    await handle.close();
    await expect(handle.close()).resolves.toBeUndefined();
  });

  it("passes idle connection errors to the handler instead of crashing the process", async () => {
    const errors: Error[] = [];
    const handle = createDatabase(UNREACHABLE_URL, { onIdleConnectionError: (error) => errors.push(error) });
    const failure = new Error("Connection terminated unexpectedly");

    handle.db.$client.emit("error", failure);

    expect(errors).toEqual([failure]);
    await handle.close();
  });
});
