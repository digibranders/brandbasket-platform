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
});
