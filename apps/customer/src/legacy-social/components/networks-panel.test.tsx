import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const addNetworkAction = vi.fn(async () => ({ error: null, notice: "ok" }));
vi.mock("@/legacy-social/review-actions", () => ({ addNetworkAction: (...args: unknown[]) => addNetworkAction(...(args as [])) }));
vi.mock("./use-review-action", () => ({
  useReviewAction: () => ({ pending: false, error: null, notice: null, run: (action: (data: FormData) => unknown, values: Record<string, string>) => { const data = new FormData(); for (const [key, value] of Object.entries(values)) data.set(key, value); void action(data); } }),
}));

import { NetworksPanel } from "./networks-panel";

afterEach(() => {
  cleanup();
  addNetworkAction.mockClear();
});

describe("NetworksPanel", () => {
  it("shows nothing when every channel is already in the posts", () => {
    const { container } = render(<NetworksPanel missing={[]} busy={false} />);
    expect(container.textContent).toBe("");
  });

  it("says the written posts stay as they are and writes nothing by itself", () => {
    render(<NetworksPanel missing={["facebook"]} busy={false} />);
    expect(screen.getByText(/They stay as they are/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Add Facebook to my posts/ })).toBeNull();
    expect(addNetworkAction).not.toHaveBeenCalled();
  });

  it("warns first, and only writes after the customer confirms", () => {
    render(<NetworksPanel missing={["facebook"]} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a channel to these posts" }));
    fireEvent.click(screen.getByRole("button", { name: "Add Facebook to my posts" }));
    expect(screen.getByRole("alertdialog").textContent).toMatch(/new words for Facebook and draws a picture for each topic you have kept/);
    expect(addNetworkAction).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Yes, write and draw" }));
    expect(addNetworkAction).toHaveBeenCalledTimes(1);
  });

  it("writes nothing when she cancels", () => {
    render(<NetworksPanel missing={["linkedin"]} busy={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Add a channel to these posts" }));
    fireEvent.click(screen.getByRole("button", { name: "Add LinkedIn to my posts" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(addNetworkAction).not.toHaveBeenCalled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
