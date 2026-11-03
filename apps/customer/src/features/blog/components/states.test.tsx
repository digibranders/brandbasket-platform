import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { Loaded } from "@/lib/loaded";
import type { BlogPostSummary, BlogUsage } from "../rules/posts";
import { PostsScreen } from "./posts-screen";
import { AuthorsScreen, CategoriesScreen } from "./taxonomy-screens";

vi.mock("next/navigation", () => ({ usePathname: () => "/website/blog", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("../actions", () => ({ unlockPostsAction: vi.fn() }));

const NOW = new Date("2026-11-03T10:00:00.000Z");
const FAILED = { ok: false, error: { at: NOW } } as const;
const NOISE = /No data|undefined|\bnull\b|NaN/;
const POST: BlogPostSummary = { id: "7", title: "Monsoon menu", status: "published", updatedAt: NOW.getTime(), publishedAt: NOW.getTime() - 86_400_000, categoryName: "Menus", authorName: null, publishState: "published" };
const USAGE: BlogUsage = { used: 3, allowance: 100, nextBlock: { posts: 100, amountCents: 47_500, currency: "INR" } };

const frame = { canWrite: true, hasPages: false, now: NOW } as const;

describe("Blog posts states", () => {
  it("a failed posts read shows its own error, keeps the usage line out and the page frame in", () => {
    render(<PostsScreen posts={FAILED} usage={{ ok: true, data: USAGE }} {...frame} />);
    expect(screen.getByRole("alert").textContent).toContain("We could not load your posts.");
    expect(screen.getByRole("heading", { name: "Posts" })).toBeTruthy();
    expect(screen.queryByText("No posts yet")).toBeNull();
  });

  it("a failed usage read shows its own error and still lists the posts", () => {
    render(<PostsScreen posts={{ ok: true, data: [POST] }} usage={FAILED} {...frame} />);
    expect(screen.getByRole("alert").textContent).toContain("We could not load how many posts your plan has left.");
    expect(screen.getByRole("link", { name: "Monsoon menu" })).toBeTruthy();
  });

  it("no posts says why and what will appear", () => {
    const { container } = render(<PostsScreen posts={{ ok: true, data: [] }} usage={{ ok: true, data: null }} {...frame} />);
    expect(screen.getByText("No posts yet")).toBeTruthy();
    expect(screen.getByText(/A new post stays a draft until you publish it/)).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });
});

describe.each([
  { name: "Authors", render: (rows: Loaded<readonly never[]>) => <AuthorsScreen rows={rows} {...frame} />, what: "your authors", empty: "No authors yet", sentence: /Add the people who write your posts/ },
  { name: "Categories", render: (rows: Loaded<readonly never[]>) => <CategoriesScreen rows={rows} {...frame} />, what: "your categories", empty: "No categories yet", sentence: /Categories group your posts by topic/ },
])("$name states", ({ name, render: draw, what, empty, sentence }) => {
  it("a failed read shows its own error under the real heading", () => {
    render(draw(FAILED));
    expect(screen.getByRole("alert").textContent).toContain(`We could not load ${what}.`);
    expect(screen.getByRole("heading", { name })).toBeTruthy();
    expect(screen.queryByText(empty)).toBeNull();
  });

  it("an empty list says why and what will appear", () => {
    const { container } = render(draw({ ok: true, data: [] }));
    expect(screen.getByText(empty)).toBeTruthy();
    expect(screen.getByText(sentence)).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });
});
