import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { WelcomeDialog } from "./welcome-dialog";

const replace = vi.fn();
let search = "";
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace }), useSearchParams: () => new URLSearchParams(search) }));

const TITLE = "Payment received. Welcome to Brandbasket.";

beforeEach(() => {
  replace.mockReset();
  search = "welcome=1";
});

describe("WelcomeDialog", () => {
  it("opens on its own after the first payment while the questions are to do, and says what they are for", async () => {
    render(<WelcomeDialog questionsOpen />);
    const dialog = await screen.findByRole("dialog", { name: TITLE });
    expect(dialog.textContent).toContain("A few short questions help us build the right site for you.");
  });

  it("leads to the questions", async () => {
    render(<WelcomeDialog questionsOpen />);
    const link = await screen.findByRole("link", { name: "Answer a few questions" });
    expect(link.getAttribute("href")).toBe("/start");
  });

  it("closes on Not now and takes the welcome parameter out of the address", async () => {
    render(<WelcomeDialog questionsOpen />);
    await userEvent.click(await screen.findByRole("button", { name: "Not now" }));
    expect(replace).toHaveBeenCalledWith("/");
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  });

  it("clears the parameter when it is closed another way too", async () => {
    render(<WelcomeDialog questionsOpen />);
    await userEvent.click(await screen.findByRole("button", { name: "Close" }));
    expect(replace).toHaveBeenCalledWith("/");
  });

  it("does not open without the welcome parameter", () => {
    search = "";
    render(<WelcomeDialog questionsOpen />);
    expect(screen.queryByRole("dialog")).toBeNull();
    search = "welcome=2";
    render(<WelcomeDialog questionsOpen />);
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("does not open once the questions are finished", () => {
    render(<WelcomeDialog questionsOpen={false} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(replace).not.toHaveBeenCalled();
  });
});
