import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { MoveAccountPrompt } from "./move-account";

vi.mock("@/legacy-social/actions", () => ({ moveChannelAction: vi.fn() }));

afterEach(cleanup);

describe("MoveAccountPrompt", () => {
  it("names the brand that holds the account, says what moving does, and sends the channel and the brand it comes from", () => {
    const { container } = render(<MoveAccountPrompt offer={{ channel: "instagram", heldBy: "brand-1", brandName: "Fresh Sweets" }} />);
    expect(screen.getByText("This Instagram account is connected to Fresh Sweets")).toBeTruthy();
    expect(screen.getByText(/Posts scheduled for Instagram on Fresh Sweets will stop going out/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Move it here" })).toBeTruthy();
    expect((container.querySelector('input[name="channel"]') as HTMLInputElement).value).toBe("instagram");
    expect((container.querySelector('input[name="moveFrom"]') as HTMLInputElement).value).toBe("brand-1");
  });

  it("can be cancelled by going back to the page, which changes nothing", () => {
    render(<MoveAccountPrompt offer={{ channel: "facebook", heldBy: "b", brandName: "B" }} />);
    expect(screen.getByRole("link", { name: "Cancel" }).getAttribute("href")).toBe("/social");
  });
});
