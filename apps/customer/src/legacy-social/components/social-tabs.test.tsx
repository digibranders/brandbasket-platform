import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SocialTabs } from "./social-tabs";

const chosen = vi.hoisted(() => ({ value: null as string | null }));
vi.mock("next/navigation", () => ({ useSearchParams: () => ({ get: (name: string) => (name === "channel" ? chosen.value : null) }) }));

afterEach(() => {
  cleanup();
  chosen.value = null;
});

describe("SocialTabs", () => {
  it("links to Analytics once there are numbers", () => {
    render(<SocialTabs current="calendar" hasNumbers />);
    expect(screen.getByRole("link", { name: "Analytics" })).toBeTruthy();
  });

  it("asks for a connection when nothing is connected", () => {
    render(<SocialTabs current="calendar" hasNumbers={false} />);
    expect(screen.getByText("Connect an account first")).toBeTruthy();
  });

  it("says LinkedIn has no numbers when LinkedIn is all that is connected", () => {
    render(<SocialTabs current="calendar" hasNumbers={false} onlyWithoutNumbers />);
    expect(screen.getByText("LinkedIn has no numbers yet")).toBeTruthy();
    expect(screen.queryByText("Connect an account first")).toBeNull();
  });

  it("shows the Posts tab only once posts have been written", () => {
    render(<SocialTabs current="calendar" hasNumbers hasPosts />);
    expect(screen.getByRole("link", { name: "Posts" }).getAttribute("href")).toBe("/social/review");
    expect(screen.getByRole("link", { name: "Calendar" }).getAttribute("aria-current")).toBe("page");
    cleanup();
    render(<SocialTabs current="calendar" hasNumbers />);
    expect(screen.queryByRole("link", { name: "Posts" })).toBeNull();
  });

  it("takes the channel she is looking at to the next tab", () => {
    chosen.value = "instagram";
    render(<SocialTabs current="calendar" hasNumbers hasPosts />);
    expect(screen.getByRole("link", { name: "Calendar" }).getAttribute("href")).toBe("/social?channel=instagram");
    expect(screen.getByRole("link", { name: "Posts" }).getAttribute("href")).toBe("/social/review?channel=instagram");
    expect(screen.getByRole("link", { name: "Analytics" }).getAttribute("href")).toBe("/social/analytics?channel=instagram");
  });

  it("puts the number waiting for the customer beside Posts, and says what it is", () => {
    render(<SocialTabs current="calendar" hasNumbers hasPosts waiting={14} />);
    const posts = screen.getByRole("link", { name: /^Posts/ });
    expect(posts.textContent).toContain("14");
    expect(posts.querySelector("[title]")?.getAttribute("title")).toBe("14 waiting for you on Posts");
  });

  it("shows no number beside Posts when nothing waits, or when it is not known", () => {
    render(<SocialTabs current="calendar" hasNumbers hasPosts waiting={0} />);
    expect(screen.getByRole("link", { name: "Posts" }).textContent).toBe("Posts");
    cleanup();
    render(<SocialTabs current="calendar" hasNumbers hasPosts />);
    expect(screen.getByRole("link", { name: "Posts" }).textContent).toBe("Posts");
  });
});
