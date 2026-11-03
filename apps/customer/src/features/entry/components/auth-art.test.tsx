import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { AUTH_HEADLINE, AuthArt } from "./auth-art";

describe("AuthArt", () => {
  it("shows the approved headline and the three services, hidden from screen readers", () => {
    const { container } = render(<AuthArt />);
    const panel = container.querySelector("section");
    expect(panel?.getAttribute("aria-hidden")).toBe("true");
    expect(panel?.textContent?.replace(/\s+/g, " ").trim()).toContain(AUTH_HEADLINE);
    for (const label of ["Your website", "Your posts and ads", "Found on Google"]) expect(panel?.textContent).toContain(label);
  });
});
