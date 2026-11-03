import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { BlogPostSummary, BlogUsage } from "../rules/posts";
import { PostsScreen } from "./posts-screen";

vi.mock("next/navigation", () => ({ usePathname: () => "/website/blog", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ unlockPostsAction: vi.fn() }));

const NOW = new Date("2026-11-03T10:00:00.000Z");
const POST: BlogPostSummary = { id: "7", title: "Monsoon menu", status: "published", updatedAt: NOW.getTime(), publishedAt: NOW.getTime() - 86_400_000, categoryName: "Menus", authorName: null, publishState: "published" };
const usage = (used: number): BlogUsage => ({ used, allowance: 100, nextBlock: { posts: 100, amountCents: 47_500, currency: "INR" } });
const failure = { ok: false as const, error: { at: NOW } };

describe("PostsScreen", () => {
  it("shows the error, not an empty blog, when the posts cannot be read", () => {
    render(<PostsScreen posts={failure} usage={{ ok: true, data: usage(3) }} canWrite hasPages={false} now={NOW} />);
    expect(screen.getByText("We could not load your posts.")).toBeTruthy();
    expect(screen.queryByText("No posts yet")).toBeNull();
  });

  it("says how many posts are used, and nothing about a limit when there is no plan", () => {
    const { unmount } = render(<PostsScreen posts={{ ok: true, data: [POST] }} usage={{ ok: true, data: usage(12) }} canWrite hasPages={false} now={NOW} />);
    expect(screen.getByText("12 of 100 posts used.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "New post" })).toBeTruthy();
    unmount();
    render(<PostsScreen posts={{ ok: true, data: [POST] }} usage={{ ok: true, data: null }} canWrite hasPages={false} now={NOW} />);
    expect(screen.queryByText(/posts used/)).toBeNull();
  });

  it("offers to unlock more, with the price, instead of New post at the limit", () => {
    render(<PostsScreen posts={{ ok: true, data: [POST] }} usage={{ ok: true, data: usage(100) }} canWrite hasPages={false} now={NOW} />);
    expect(screen.getByRole("button", { name: "Unlock more posts" })).toBeTruthy();
    expect(screen.getByText("100 of 100 posts used. Unlock 100 more for ₹475 to keep writing.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "New post" })).toBeNull();
  });

  it("hides every write control from a viewer", () => {
    render(<PostsScreen posts={{ ok: true, data: [] }} usage={{ ok: true, data: usage(100) }} canWrite={false} hasPages={false} now={NOW} />);
    expect(screen.queryByRole("link", { name: "New post" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Unlock more posts" })).toBeNull();
    expect(screen.queryByRole("link", { name: "Write your first post" })).toBeNull();
  });

  it("shows the usage error on its own and keeps the posts", () => {
    render(<PostsScreen posts={{ ok: true, data: [POST] }} usage={failure} canWrite hasPages={false} now={NOW} />);
    expect(screen.getByText("We could not load how many posts your plan has left.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Monsoon menu" })).toBeTruthy();
  });
});
