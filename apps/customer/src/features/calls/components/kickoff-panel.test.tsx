import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { KickoffPanel } from "./kickoff-panel";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ bookKickoffAction: vi.fn() }));
vi.mock("./slot-picker", () => ({
  useCallSlots: () => ({ state: { status: "ok", slots: [] }, drop: vi.fn() }),
  SlotChooser: () => <div data-testid="slot-chooser">SlotChooser</div>,
}));

describe("KickoffPanel", () => {
  it("renders unbooked panel when booked is null", () => {
    const { container } = render(
      <KickoffPanel
        services={["website"]}
        bookingUrl="https://cal.com/team/brandbasket"
        canBook={true}
        cannotBookLine={null}
        booked={null}
        missedLine={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "Book your kickoff call" })).toBeTruthy();
    expect(screen.getByText(/30 minutes on video/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Join meeting/ })).toBeNull();
    expect(container.textContent).not.toContain("\u2014");
    expect(container.textContent).not.toContain("\u2013");
  });

  it("renders booked call timing without join meeting button when meetingUrl is not present", () => {
    const { container } = render(
      <KickoffPanel
        services={["website"]}
        bookingUrl="https://cal.com/team/brandbasket"
        canBook={true}
        cannotBookLine={null}
        booked={{
          startsAtIso: "2026-11-03T05:30:00.000Z", // 11:00 IST
          endsAtIso: "2026-11-03T06:00:00.000Z", // 11:30 IST
        }}
        missedLine={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "Kickoff call booked" })).toBeTruthy();
    expect(screen.getByText(/Your kickoff call is booked for Tue 3 Nov, 11:00 to 11:30/)).toBeTruthy();
    expect(screen.getByText("Video call. The link is in your email and calendar invite.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /Add to calendar/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change time" })).toBeTruthy();
    expect(screen.queryByRole("link", { name: /Join meeting/ })).toBeNull();
    expect(container.textContent).not.toContain("\u2014");
    expect(container.textContent).not.toContain("\u2013");
  });

  it("renders prominent Join meeting button when meetingUrl is present", () => {
    const meetingUrl = "https://app.cal.com/video/brandbasket-kickoff-123";
    const { container } = render(
      <KickoffPanel
        services={["website"]}
        bookingUrl="https://cal.com/team/brandbasket"
        canBook={true}
        cannotBookLine={null}
        booked={{
          startsAtIso: "2026-11-03T05:30:00.000Z", // 11:00 IST
          endsAtIso: "2026-11-03T06:00:00.000Z", // 11:30 IST
          meetingUrl,
        }}
        missedLine={null}
      />,
    );

    expect(screen.getByRole("heading", { name: "Kickoff call booked" })).toBeTruthy();
    expect(screen.getByText(/Your kickoff call is booked for Tue 3 Nov, 11:00 to 11:30/)).toBeTruthy();
    expect(screen.getByText("Video call. Join with the button below, or use the link in your calendar invite.")).toBeTruthy();

    const joinButton = screen.getByRole("link", { name: /Join meeting/ });
    expect(joinButton).toBeTruthy();
    expect(joinButton.getAttribute("href")).toBe(meetingUrl);
    expect(joinButton.getAttribute("target")).toBe("_blank");
    expect(joinButton.getAttribute("rel")).toContain("noopener");
    expect(joinButton.getAttribute("rel")).toContain("noreferrer");

    expect(screen.getByRole("link", { name: /Add to calendar/ })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Change time" })).toBeTruthy();
    expect(container.textContent).not.toContain("\u2014");
    expect(container.textContent).not.toContain("\u2013");
  });
});
