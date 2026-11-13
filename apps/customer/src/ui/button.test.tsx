import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Button } from "./button";
import { IconButton } from "./icon-button";
import { LinkButton } from "./link-button";
import { expectNoAxeViolations } from "./test-axe";

describe("Button", () => {
  it("is a button that runs on Enter and Space", async () => {
    const onClick = vi.fn();
    const { container } = render(<Button variant="primary" onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    button.focus();
    await userEvent.keyboard("{Enter}");
    await userEvent.keyboard(" ");
    expect(onClick).toHaveBeenCalledTimes(2);
    await expectNoAxeViolations(container);
  });

  it("does nothing while pending, stays focusable and says it is busy", async () => {
    const onClick = vi.fn();
    render(<Button pending onClick={onClick}>Save</Button>);
    const button = screen.getByRole("button", { name: "Save" });
    expect(button.getAttribute("aria-busy")).toBe("true");
    await userEvent.click(button);
    expect(onClick).not.toHaveBeenCalled();
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it("is not clickable when disabled", async () => {
    const onClick = vi.fn();
    render(<Button disabled onClick={onClick}>Save</Button>);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe("IconButton", () => {
  it("is named by its label and shows it as a tooltip on focus", async () => {
    const { container } = render(<IconButton icon="Bell" label="Notifications" />);
    const button = screen.getByRole("button", { name: "Notifications" });
    await userEvent.tab();
    expect(document.activeElement).toBe(button);
    expect(await screen.findByText("Notifications")).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});

describe("LinkButton", () => {
  it("is a link, not a button", () => {
    render(<LinkButton href="/billing" variant="primary">Plan and billing</LinkButton>);
    expect(screen.getByRole("link", { name: "Plan and billing" }).getAttribute("href")).toBe("/billing");
  });
});
