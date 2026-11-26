import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RequestBanner } from "./request-banner";

vi.mock("../actions", () => ({ startConnectAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const request = (network: "instagram" | "facebook", state: "requested" | "invited" | "refused" | "connected", extra: { steps?: string[]; reason?: string } = {}) => ({ network, url: "https://example.test/x", handle: "acme", state, steps: extra.steps ?? [], reason: extra.reason ?? null });

describe("RequestBanner", () => {
  it("shows nothing while the team is reviewing, and once the account is connected", () => {
    const { container } = render(<RequestBanner requests={[request("instagram", "requested"), request("facebook", "connected")]} />);
    expect(container.textContent).toBe("");
  });

  it("tells her it is her turn, with the numbered steps and an Allow button, for each network", () => {
    render(<RequestBanner requests={[request("instagram", "invited", { steps: ["Accept the invite.", "Press Allow Instagram."] }), request("facebook", "invited", { steps: ["Accept it.", "Press Allow Facebook."] })]} />);
    expect(screen.getByText("Your Instagram is ready to connect")).toBeTruthy();
    expect(screen.getByText("Your Facebook is ready to connect")).toBeTruthy();
    expect(screen.getByText("Accept the invite.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow Instagram" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Allow Facebook" })).toBeTruthy();
  });

  it("says why the team could not set the account up and where to send a new link", () => {
    render(<RequestBanner requests={[request("facebook", "refused", { reason: "This is a personal profile." })]} />);
    expect(screen.getByText("We could not set up your Facebook")).toBeTruthy();
    expect(screen.getByText("This is a personal profile.")).toBeTruthy();
    expect(screen.getByText(/Send a new link/)).toBeTruthy();
  });
});
