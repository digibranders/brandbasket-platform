import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import AppLoading from "./(app)/loading";
import PayLoading from "./(pay)/loading";
import InviteError from "./invite/[token]/error";

vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn() }));

describe("route states added in R2-10", () => {
  it("the workspace loading state is announced as busy and holds the place of a title and a panel", () => {
    const { container } = render(<AppLoading />);
    expect(screen.getByRole("status", { name: "Loading" }).getAttribute("aria-busy")).toBe("true");
    expect(container.querySelectorAll("[aria-hidden]").length).toBeGreaterThan(4);
  });

  it("the payment loading state is announced as busy", () => {
    render(<PayLoading />);
    expect(screen.getByRole("status", { name: "Loading" }).getAttribute("aria-busy")).toBe("true");
  });

  it("the invite error says the data is safe and offers Try again", async () => {
    const retry = vi.fn();
    render(<InviteError error={new Error("boom")} retry={retry} />);
    expect(screen.getByText("We could not load this page.")).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(retry).toHaveBeenCalledTimes(1);
  });
});
