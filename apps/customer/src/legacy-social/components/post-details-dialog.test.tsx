import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import type { CalendarPost } from "@/legacy-social/lib/social/auto";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/legacy-social/actions", () => ({ changeWrittenCaptionAction: vi.fn(), changeWrittenPostTimeAction: vi.fn() }));

import { PostDetailsDialog } from "./post-details-dialog";

beforeAll(() => {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
});
afterEach(() => {
  cleanup();
  document.body.style.overflow = "";
});

const base: CalendarPost = { id: "b-car", day: "2026-12-04", time: "10:00", caption: "Words", state: "scheduled", channels: [], manual: false, imageUrl: "https://x.example/posts/a-1.png" };

describe("PostDetailsDialog", () => {
  it("shows every slide of a carousel, in order, and not only the first picture", () => {
    const urls = ["https://x.example/posts/a-1.png", "https://x.example/posts/a-2.png", "https://x.example/posts/a-3.png"];
    render(<PostDetailsDialog post={{ ...base, imageUrls: urls }} onClose={() => undefined} />);
    expect(screen.getAllByRole("img", { hidden: true }).map((img) => img.getAttribute("alt"))).toEqual(["Slide 1 of 3", "Slide 2 of 3", "Slide 3 of 3"]);
  });

  it("shows the one picture of an ordinary post", () => {
    render(<PostDetailsDialog post={base} onClose={() => undefined} />);
    expect(screen.getAllByRole("img", { hidden: true }).map((img) => img.getAttribute("alt"))).toEqual(["The picture of this post"]);
  });

  it("holds the page behind it still while it is open", () => {
    const { unmount } = render(<PostDetailsDialog post={base} onClose={() => undefined} />);
    expect(document.body.style.overflow).toBe("hidden");
    unmount();
    expect(document.body.style.overflow).toBe("");
  });

  it("shows a network's own picture with its caption, so LinkedIn's wide picture is not hidden behind the Instagram one", () => {
    const post = { ...base, variants: { linkedin: "A longer LinkedIn caption." }, variantImages: { linkedin: "https://x.example/posts/a-linkedin.png" } } as CalendarPost;
    render(<PostDetailsDialog post={post} onClose={() => undefined} />);
    const alts = screen.getAllByRole("img", { hidden: true }).map((img) => img.getAttribute("alt")).filter((alt) => alt?.startsWith("The ") === true);
    expect(alts).toEqual(["The picture of this post", "The LinkedIn picture of this post"]);
    expect(screen.getByText("LinkedIn picture and caption")).toBeTruthy();
    expect(screen.getByText("A longer LinkedIn caption.")).toBeTruthy();
  });

  it("shows a network that has its own picture but the same words, with its picture only", () => {
    const post = { ...base, variantImages: { linkedin: "https://x.example/posts/a-linkedin.png" } } as CalendarPost;
    render(<PostDetailsDialog post={post} onClose={() => undefined} />);
    expect(screen.getByText("LinkedIn picture")).toBeTruthy();
    expect(screen.getAllByRole("img", { hidden: true }).filter((img) => img.getAttribute("alt")?.startsWith("The ") === true)).toHaveLength(2);
  });

  const both: CalendarPost = {
    ...base,
    caption: "Instagram words.",
    imageUrl: "https://x.example/posts/ig.png",
    variants: { linkedin: "LinkedIn words." },
    variantImages: { linkedin: "https://x.example/posts/li.png" },
    channels: [
      { platform: "instagram", account: "alsonotify", state: "scheduled", permalink: null },
      { platform: "linkedin", account: "Steff Jay", state: "scheduled", permalink: null },
    ],
  } as CalendarPost;
  const srcs = (): string[] => screen.getAllByRole("img", { hidden: true }).map((img) => img.getAttribute("src") ?? "").filter((src) => src.includes("posts"));

  it("on LinkedIn's own calendar shows LinkedIn's picture, LinkedIn's words and LinkedIn's account, and nothing of Instagram", () => {
    render(<PostDetailsDialog post={both} shown={new Set(["linkedin"])} onClose={() => undefined} />);
    expect(srcs()).toHaveLength(1);
    expect(srcs()[0]).toContain(encodeURIComponent("https://x.example/posts/li.png"));
    expect(screen.getByText("LinkedIn words.")).toBeTruthy();
    expect(screen.queryByText("Instagram words.")).toBeNull();
    expect(screen.queryByText("LinkedIn picture and caption")).toBeNull();
    expect(screen.getByText("Steff Jay")).toBeTruthy();
    expect(screen.queryByText("alsonotify")).toBeNull();
  });

  it("on Instagram's own calendar shows the main picture and words, and not LinkedIn's", () => {
    render(<PostDetailsDialog post={both} shown={new Set(["instagram"])} onClose={() => undefined} />);
    expect(srcs()).toHaveLength(1);
    expect(srcs()[0]).toContain(encodeURIComponent("https://x.example/posts/ig.png"));
    expect(screen.getByText("Instagram words.")).toBeTruthy();
    expect(screen.queryByText("LinkedIn words.")).toBeNull();
    expect(screen.queryByText("Steff Jay")).toBeNull();
  });

  it("on a network with no picture or words of its own shows the main ones", () => {
    render(<PostDetailsDialog post={both} shown={new Set(["facebook"])} onClose={() => undefined} />);
    expect(srcs()[0]).toContain(encodeURIComponent("https://x.example/posts/ig.png"));
    expect(screen.getByText("Instagram words.")).toBeTruthy();
  });

  it("with every network shown, keeps showing each network's own picture and words beside the main ones", () => {
    render(<PostDetailsDialog post={both} shown={new Set(["instagram", "facebook", "linkedin", "google"])} onClose={() => undefined} />);
    expect(srcs()).toHaveLength(2);
    expect(screen.getByText("Instagram words.")).toBeTruthy();
    expect(screen.getByText("LinkedIn words.")).toBeTruthy();
  });
});
