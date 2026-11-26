import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cancelChannelRequestAction, requestChannelAction } from "../actions";
import { RequestChannel } from "./request-channel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ requestChannelAction: vi.fn(), cancelChannelRequestAction: vi.fn(), startConnectAction: vi.fn() }));

afterEach(() => {
  cleanup();
  vi.resetAllMocks();
});

const request = (state: "requested" | "invited" | "refused", reason: string | null = null) => ({ network: "instagram" as const, url: "https://instagram.com/acme_foods", handle: "acme_foods", state, steps: [], reason });

describe("RequestChannel", () => {
  it("asks for the profile link first, and sends it", async () => {
    vi.mocked(requestChannelAction).mockResolvedValue({ ok: true, data: { handle: "acme_foods" } } as never);
    render(<RequestChannel platform="instagram" request={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Add your Instagram profile" }));
    fireEvent.change(screen.getByLabelText(/Paste the link/), { target: { value: "instagram.com/acme_foods" } });
    fireEvent.click(screen.getByRole("button", { name: "Send my link" }));
    await waitFor(() => expect(requestChannelAction).toHaveBeenCalledWith("instagram", "instagram.com/acme_foods", undefined));
  });

  it("says what is wrong with a link in the posting service's words", async () => {
    vi.mocked(requestChannelAction).mockResolvedValue({ ok: false, message: "That is a post, not a profile." } as never);
    render(<RequestChannel platform="instagram" request={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Add your Instagram profile" }));
    fireEvent.change(screen.getByLabelText(/Paste the link/), { target: { value: "instagram.com/p/x" } });
    fireEvent.click(screen.getByRole("button", { name: "Send my link" }));
    expect(await screen.findByText("That is a post, not a profile.")).toBeTruthy();
  });

  it("tells her we are reviewing her profile while the team has not set it up", () => {
    render(<RequestChannel platform="instagram" request={request("requested")} />);
    expect(screen.getByText("We are reviewing @acme_foods so you can keep using Instagram. We will tell you here as soon as it is your turn.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Allow Instagram" })).toBeNull();
  });

  it("offers Allow once she is added, and lets her take the request back", async () => {
    vi.mocked(cancelChannelRequestAction).mockResolvedValue({ ok: true } as never);
    render(<RequestChannel platform="instagram" request={request("invited")} />);
    expect(screen.getByRole("button", { name: "Allow Instagram" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Send a different link" }));
    await waitFor(() => expect(cancelChannelRequestAction).toHaveBeenCalledWith("instagram"));
  });

  it("gives the team's reason when it could not set the account up, and lets her send a new link", () => {
    render(<RequestChannel platform="instagram" request={request("refused", "This is a personal account.")} />);
    expect(screen.getByText("This is a personal account.")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Send a new link" })).toBeTruthy();
  });
});

describe("RequestChannel, the person's own profile", () => {
  it("asks for it only when the network needs it, and sends it with the link", async () => {
    vi.mocked(requestChannelAction).mockResolvedValue({ ok: true, data: { handle: "acmefoods" } } as never);
    render(<RequestChannel platform="facebook" request={null} needsPerson />);
    fireEvent.click(screen.getByRole("button", { name: "Add your Facebook page" }));
    fireEvent.change(screen.getByLabelText(/Paste the link/), { target: { value: "facebook.com/acmefoods" } });
    fireEvent.change(screen.getByLabelText(/Your own Facebook profile/), { target: { value: "facebook.com/asha.mehta" } });
    fireEvent.click(screen.getByRole("button", { name: "Send my link" }));
    await waitFor(() => expect(requestChannelAction).toHaveBeenCalledWith("facebook", "facebook.com/acmefoods", "facebook.com/asha.mehta"));
  });

  it("does not show the second box when the network does not need it", () => {
    render(<RequestChannel platform="instagram" request={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Add your Instagram profile" }));
    expect(screen.queryByLabelText(/Your own Facebook profile/)).toBeNull();
  });
});
