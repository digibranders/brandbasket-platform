import { beforeEach, describe, expect, it, vi } from "vitest";
import CallsPage from "./calls/page";
import ProjectsPage from "./projects/page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((url: string) => {
    throw new Error(`redirect:${url}`);
  }),
}));

function landing(page: () => never): string {
  try {
    page();
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("redirect:")) return error.message.slice("redirect:".length);
    throw error;
  }
  throw new Error("The page did not redirect.");
}

beforeEach(() => vi.clearAllMocks());

describe("the two console URLs the redesign merges away", () => {
  it("/calls lands on Today", () => {
    expect(landing(CallsPage)).toBe("/");
  });

  it("/projects lands on the Builds view of Clients", () => {
    expect(landing(ProjectsPage)).toBe("/clients?view=builds");
  });
});
