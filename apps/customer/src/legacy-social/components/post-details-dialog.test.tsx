import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { viewForChannels, type CalendarPost } from "@/legacy-social/lib/social/auto";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const captionAction = vi.hoisted(() => vi.fn());
const timeAction = vi.hoisted(() => vi.fn());
vi.mock("@/legacy-social/actions", () => ({ changeWrittenCaptionAction: captionAction, changeWrittenPostTimeAction: timeAction }));

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

  describe("changing the words", () => {
    const future: CalendarPost = { ...both, day: "2099-01-05" } as CalendarPost;

    it("changes the words of the network that was chosen, and starts from that network's own words", async () => {
      captionAction.mockResolvedValue({ status: "partial", message: "Saved." });
      render(<PostDetailsDialog post={future} onClose={() => undefined} />);
      fireEvent.click(screen.getByRole("button", { name: /Change caption/ }));
      const caption = screen.getByRole("textbox") as HTMLTextAreaElement;
      expect(caption.value).toBe("Instagram words.");
      fireEvent.change(screen.getByLabelText("Change the words for"), { target: { value: "linkedin" } });
      expect(caption.value).toBe("LinkedIn words.");
      fireEvent.change(caption, { target: { value: "New LinkedIn words." } });
      fireEvent.click(screen.getByRole("button", { name: "Save caption" }));
      await waitFor(() => expect(captionAction).toHaveBeenCalledTimes(1));
      const form = captionAction.mock.calls[0]?.[0] as FormData;
      expect([form.get("network"), form.get("caption"), form.get("postId")]).toEqual(["linkedin", "New LinkedIn words.", future.id]);
    });

    it("on one network's calendar the words are that network's, with no choice of network", async () => {
      captionAction.mockReset();
      captionAction.mockResolvedValue({ status: "partial", message: "Saved." });
      const view = viewForChannels(future, new Set(["linkedin"]));
      render(<PostDetailsDialog post={view} shown={new Set(["linkedin"])} onClose={() => undefined} />);
      fireEvent.click(screen.getByRole("button", { name: /Change caption/ }));
      expect(screen.queryByLabelText("Change the words for")).toBeNull();
      expect((screen.getByRole("textbox") as HTMLTextAreaElement).value).toBe("LinkedIn words.");
      fireEvent.click(screen.getByRole("button", { name: "Save caption" }));
      await waitFor(() => expect(captionAction).toHaveBeenCalledTimes(1));
      expect((captionAction.mock.calls[0]?.[0] as FormData).get("network")).toBe("linkedin");
    });
  });

  describe("changing the time", () => {
    // A day the form allows (from today to 89 days ahead), already in the form when it opens, so the channel choice is what is tested.
    const soon = new Date(Date.now() + 10 * 86_400_000).toISOString().slice(0, 10);
    const future: CalendarPost = { ...both, day: soon, time: "16:30" } as CalendarPost;
    const save = async (): Promise<FormData> => {
      fireEvent.click(screen.getByRole("button", { name: "Save time" }));
      await waitFor(() => expect(timeAction).toHaveBeenCalledTimes(1));
      return timeAction.mock.calls[0]?.[0] as FormData;
    };

    it("moves every channel of the post unless one channel is chosen", async () => {
      timeAction.mockReset();
      timeAction.mockResolvedValue({ status: "saved" });
      render(<PostDetailsDialog post={future} onClose={() => undefined} />);
      fireEvent.click(screen.getByRole("button", { name: /Change time/ }));
      expect((screen.getByLabelText("Change the time for") as HTMLSelectElement).value).toBe("all");
      const form = await save();
      expect([form.get("postId"), form.get("day"), form.get("time"), form.get("network")]).toEqual([future.id, soon, "16:30", null]);
    });

    it("moves only the chosen channel, which then goes out at its own time", async () => {
      timeAction.mockReset();
      timeAction.mockResolvedValue({ status: "saved" });
      render(<PostDetailsDialog post={future} onClose={() => undefined} />);
      fireEvent.click(screen.getByRole("button", { name: /Change time/ }));
      fireEvent.change(screen.getByLabelText("Change the time for"), { target: { value: "linkedin" } });
      expect(screen.getByText(/Only LinkedIn goes out at this time/)).toBeTruthy();
      const form = await save();
      expect(form.get("network")).toBe("linkedin");
    });

    it("on one channel's own post (its calendar, or its part of a post) is that channel's time, with no choice", async () => {
      timeAction.mockReset();
      timeAction.mockResolvedValue({ status: "saved" });
      render(<PostDetailsDialog post={viewForChannels(future, new Set(["linkedin"]))} shown={new Set(["linkedin"])} onClose={() => undefined} />);
      fireEvent.click(screen.getByRole("button", { name: /Change time/ }));
      expect(screen.queryByLabelText("Change the time for")).toBeNull();
      const form = await save();
      expect(form.get("network")).toBe("linkedin");
    });
  });
});
