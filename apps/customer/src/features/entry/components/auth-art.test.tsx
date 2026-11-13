import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AuthArt, LAUNCH_STEPS } from "./auth-art";

describe("AuthArt", () => {
  it("shows the six launch steps and the promise, hidden from screen readers", () => {
    const { container } = render(<AuthArt />);
    const panel = container.querySelector("section");
    expect(panel?.getAttribute("aria-hidden")).toBe("true");
    const lines = Array.from(container.querySelectorAll("li")).map((li) => li.textContent);
    expect(lines).toEqual([...LAUNCH_STEPS]);
    expect(panel?.textContent).toContain("Then we look after it, every month.");
  });
});
