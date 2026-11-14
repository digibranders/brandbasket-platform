import { beforeEach, describe, expect, it, vi } from "vitest";
import { completeKickoff } from "@/lib/server/kickoff-complete";
import { markCallHeldAction, undoCallHeldAction } from "./kickoff-actions";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/kickoff-complete", () => ({ completeKickoff: vi.fn() }));

beforeEach(() => {
  vi.resetAllMocks();
});

describe("markCallHeldAction", () => {
  it("refuses to mark the kickoff call from the client page", async () => {
    await expect(markCallHeldAction()).rejects.toThrow(
      "Kickoff calls can only be confirmed from the prompt popup or Today.",
    );
    expect(completeKickoff).not.toHaveBeenCalled();
  });
});

describe("undoCallHeldAction", () => {
  it("refuses to undo the kickoff call from the client page", async () => {
    await expect(undoCallHeldAction()).rejects.toThrow(
      "Kickoff call actions are not available from this tab.",
    );
  });
});
