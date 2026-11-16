import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { EntryScreen } from "./entry-screen";

describe("EntryScreen", () => {
  it("shows the chip, the title and the lede before the children", () => {
    render(
      <EntryScreen title="This invitation has expired." lede="Ask the owner." chip={{ label: "Expired", variant: "waiting" }}>
        <button type="button">Go to sign in</button>
      </EntryScreen>,
    );
    const heading = screen.getByRole("heading", { level: 1, name: "This invitation has expired." });
    const chip = screen.getByText("Expired");
    const button = screen.getByRole("button", { name: "Go to sign in" });
    expect(chip.compareDocumentPosition(heading) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(heading.compareDocumentPosition(button) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("puts the children in a focal card only when framed", () => {
    const { container, rerender } = render(
      <EntryScreen title="Sign in">
        <p>form</p>
      </EntryScreen>,
    );
    expect(container.querySelector(".shadow-hero")).toBeNull();
    rerender(
      <EntryScreen title="Sign in" framed>
        <p>form</p>
      </EntryScreen>,
    );
    expect(container.querySelector(".shadow-hero")?.textContent).toBe("form");
  });
});
