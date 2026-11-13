import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { BlogPost } from "../rules/posts";
import { PostEditor } from "./post-editor";

vi.mock("next/navigation", () => ({ usePathname: () => "/website/blog/7", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("./body-editor", () => ({ BodyEditor: () => null }));

const CLOCK = new Date("2026-11-03T10:00:00.000Z").getTime();

const post = (patch: Partial<BlogPost>): BlogPost => ({
  id: "7",
  title: "Stretches for a stiff back",
  status: "draft",
  updatedAt: CLOCK,
  publishedAt: null,
  categoryName: null,
  authorName: null,
  publishState: "draft",
  slug: "stretches-for-a-stiff-back",
  excerpt: null,
  body: null,
  coverImage: null,
  coverImageAlt: "",
  categoryId: null,
  authorId: null,
  metaTitle: null,
  metaDescription: null,
  noIndex: false,
  pathPrefix: "blog",
  ...patch,
});

const ok = vi.fn().mockResolvedValue({ ok: true });

function editor(value: BlogPost) {
  return <PostEditor post={value} websiteUrl="https://kulkarniphysio.example" categories={[]} authors={[]} canWrite save={ok} duplicate={ok} remove={ok} removeCover={ok} createCategory={ok} createAuthor={ok} />;
}

afterEach(() => {
  vi.useRealTimers();
});

describe("PostEditor publish state", () => {
  it("reads Published, not Scheduled, right after publishing while the page clock is a few seconds behind", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(CLOCK);
    const { rerender } = render(editor(post({})));
    expect(screen.getByText("Draft")).toBeTruthy();
    // The server published it 5 seconds after the page opened; the page's clock has not ticked since.
    const published = CLOCK + 5_000;
    rerender(editor(post({ status: "published", publishedAt: published, updatedAt: published + 20, publishState: "published" })));
    expect(screen.getByText("Published")).toBeTruthy();
    expect(screen.queryByText("Scheduled")).toBeNull();
  });

  it("still reads Scheduled for a date ahead", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(CLOCK);
    render(editor(post({ status: "published", publishedAt: CLOCK + 86_400_000, updatedAt: CLOCK, publishState: "scheduled" })));
    expect(screen.getByText("Scheduled")).toBeTruthy();
  });
});
