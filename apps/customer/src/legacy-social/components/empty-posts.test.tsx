import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmptyPosts } from "./empty-posts";

vi.mock("./ai-start-card", () => ({ StartDialog: () => <div>start dialog</div> }));

afterEach(cleanup);

const base = { connected: ["instagram" as const], website: "https://example.com", postingDays: null, canChange: true };

describe("EmptyPosts", () => {
  it("tells a customer with no account to connect one first", () => {
    render(<EmptyPosts channel="all" {...base} connected={[]} />);
    expect(screen.getByText("Connect an account first")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("sends a customer with no website to the business profile", () => {
    render(<EmptyPosts channel="all" {...base} website={null} />);
    expect(screen.getByText("Add your website first")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Open business profile" }).getAttribute("href")).toBe("/business");
  });

  it("offers to write the posts for the channel being looked at", () => {
    render(<EmptyPosts channel="facebook" {...base} />);
    expect(screen.getByText("No posts for Facebook yet")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Write my posts" }));
    expect(screen.getByText("start dialog")).toBeTruthy();
  });

  it("does not say it again when the start card is already on the page, with or without a website", () => {
    const { container } = render(<EmptyPosts channel="all" {...base} startCardShown />);
    expect(container.textContent).toBe("");
    cleanup();
    const again = render(<EmptyPosts channel="all" {...base} website={null} startCardShown />);
    expect(again.container.textContent).toBe("");
  });

  it("still says to connect an account first, even with the start card on the page", () => {
    render(<EmptyPosts channel="all" {...base} connected={[]} startCardShown />);
    expect(screen.getByText("Connect an account first")).toBeTruthy();
  });

  it("offers a viewer nothing to press", () => {
    render(<EmptyPosts channel="all" {...base} canChange={false} />);
    expect(screen.getByText("No posts to look over yet")).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
