import { expect, it, vi } from "vitest";
import TodoMovedPage from "./page";

vi.mock("next/navigation", () => ({
  redirect: vi.fn((path: string) => {
    throw new Error(`redirect:${path}`);
  }),
}));

it("sends an old To do link Home", () => {
  expect(() => TodoMovedPage()).toThrow("redirect:/");
});
