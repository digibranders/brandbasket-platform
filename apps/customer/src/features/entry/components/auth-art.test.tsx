import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { AuthArt, LAUNCH_STEPS } from "./auth-art";
import { SOCIAL_LAUNCH_STEPS } from "../rules/signup-panel";

vi.mock("next/navigation", () => ({
  useSearchParams: () => new URLSearchParams(),
}));

describe("AuthArt", () => {
  it("shows the six launch steps and the promise, hidden from screen readers", () => {
    const { container } = render(<AuthArt />);
    const panel = container.querySelector("section");
    expect(panel?.getAttribute("aria-hidden")).toBe("true");
    const lines = Array.from(container.querySelectorAll("li")).map((li) => li.textContent);
    expect(lines).toEqual([...LAUNCH_STEPS]);
    expect(panel?.textContent).toContain("Then we look after it, every month.");
  });

  it("renders custom steps and promise when provided as props", () => {
    const { container } = render(
      <AuthArt steps={SOCIAL_LAUNCH_STEPS} promise="Then we grow your audience, every month." />
    );
    const panel = container.querySelector("section");
    expect(panel?.getAttribute("aria-hidden")).toBe("true");
    const lines = Array.from(container.querySelectorAll("li")).map((li) => li.textContent);
    expect(lines).toEqual([...SOCIAL_LAUNCH_STEPS]);
    expect(panel?.textContent).toContain("Then we grow your audience, every month.");
    expect(panel?.textContent).not.toContain("We build your website.");
  });
});
