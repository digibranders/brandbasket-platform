import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PasswordInput } from "./password-input";

describe("PasswordInput", () => {
  it("shows and hides the password, and the button says which it will do", () => {
    const { container } = render(<PasswordInput aria-label="Password" defaultValue="secret-1!" />);
    const input = container.querySelector("input");
    expect(input?.type).toBe("password");

    fireEvent.click(screen.getByRole("button", { name: "Show password" }));
    expect(input?.type).toBe("text");
    const hide = screen.getByRole("button", { name: "Hide password" });
    expect(hide.getAttribute("aria-pressed")).toBe("true");

    fireEvent.click(hide);
    expect(input?.type).toBe("password");
  });
});
