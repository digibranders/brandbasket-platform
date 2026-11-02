import { describe, expect, it, vi } from "vitest";
import WebsitePagesMovedPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((to: string) => {
    throw new Error(`REDIRECT:${to}`);
  }),
}));

describe("the old Pages address", () => {
  it("redirects to the Website Overview", () => {
    expect(() => WebsitePagesMovedPage()).toThrow("REDIRECT:/website");
  });
});
