import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SocialTabs } from "./social-tabs";

afterEach(cleanup);

describe("SocialTabs", () => {
  it("links to Analytics once there are numbers", () => {
    render(<SocialTabs current="posts" hasNumbers />);
    expect(screen.getByRole("link", { name: "Analytics" })).toBeTruthy();
  });

  it("asks for a connection when nothing is connected", () => {
    render(<SocialTabs current="posts" hasNumbers={false} />);
    expect(screen.getByText("Connect an account first")).toBeTruthy();
  });

  it("says LinkedIn has no numbers when LinkedIn is all that is connected", () => {
    render(<SocialTabs current="posts" hasNumbers={false} onlyWithoutNumbers />);
    expect(screen.getByText("LinkedIn has no numbers yet")).toBeTruthy();
    expect(screen.queryByText("Connect an account first")).toBeNull();
  });
});
