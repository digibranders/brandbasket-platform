import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CarouselDetail, CarouselSummary } from "@/legacy-social/lib/social/carousel";
import { decideCarouselAction, makeCarouselAction, setWeeklyCarouselAction } from "@/legacy-social/review-actions";
import { CarouselCard } from "./carousel-card";

vi.mock("@/legacy-social/review-actions", () => ({ makeCarouselAction: vi.fn(async () => ({ status: "saved" })), decideCarouselAction: vi.fn(async () => ({ status: "saved" })), setWeeklyCarouselAction: vi.fn(async () => ({ status: "saved" })) }));

const summary = (status: CarouselSummary["status"]): CarouselSummary => ({ id: "c1", topic: "Diwali boxes", date: "2026-11-18", count: 3, status, headlines: [] });
const detail = (status: CarouselDetail["status"]): CarouselDetail => ({
  id: "c1",
  count: 3,
  status,
  slides: [1, 2, 3].map((position) => ({ position, status })),
  captions: [
    { network: "instagram", caption: "Fresh sweets, boxed today.", status },
    { network: "linkedin", caption: "How a family sweet shop plans Diwali.", status },
  ],
  reasons: ["weak_copy", "other"],
});

const slidesOf = (): HTMLElement[] => within(screen.getByRole("list", { name: "The slides of your carousel" })).getAllByRole("img");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("CarouselCard", () => {
  it("offers to make this week's carousel when there is none and it can be made", async () => {
    render(<CarouselCard summary={undefined} detail={null} canMake canChange making={false} weekly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Make this week's carousel" }));
    await waitFor(() => expect(vi.mocked(makeCarouselAction)).toHaveBeenCalledTimes(1));
  });

  it("shows nothing when there is no carousel and none can be made (no website read, or no account connected), or for a viewer", () => {
    const { container, rerender } = render(<CarouselCard summary={undefined} detail={null} canMake={false} canChange making={false} weekly={false} />);
    expect(container.textContent).toBe("");
    rerender(<CarouselCard summary={undefined} detail={null} canMake canChange={false} making={false} weekly={false} />);
    expect(container.textContent).toBe("");
  });

  it("says it is being made, with no slides and no buttons yet", () => {
    render(<CarouselCard summary={summary("incomplete")} detail={detail("incomplete")} canMake canChange making weekly={false} />);
    expect(screen.getByText(/We are making your carousel\. This page updates/)).toBeTruthy();
    expect(screen.queryByRole("list", { name: "The slides of your carousel" })).toBeNull();
    expect(screen.queryByRole("button")).toBeNull();
    // No carousel is listed yet but one is being asked for: the button to ask again is not offered while it is made.
    cleanup();
    render(<CarouselCard summary={undefined} detail={null} canMake canChange making weekly={false} />);
    expect(screen.queryByRole("button", { name: "Make this week's carousel" })).toBeNull();
  });

  it("shows every slide through our own route and the words for each channel, and approves the whole carousel", async () => {
    render(<CarouselCard summary={summary("pending")} detail={detail("pending")} canMake canChange making={false} weekly={false} />);
    const slides = slidesOf();
    expect(slides).toHaveLength(3);
    expect(slides[1]?.getAttribute("src")).toBe("/api/social-carousels/slide?id=c1&slide=2");
    expect(screen.getByText("Fresh sweets, boxed today.")).toBeTruthy();
    expect(screen.getByText("How a family sweet shop plans Diwali.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve the carousel" }));
    await waitFor(() => expect(vi.mocked(decideCarouselAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(decideCarouselAction).mock.calls[0]?.[0] as FormData;
    expect([form.get("id"), form.get("action")]).toEqual(["c1", "approve"]);
  });

  it("sends the whole carousel back only with a reason, and passes the comment on", async () => {
    render(<CarouselCard summary={summary("pending")} detail={detail("pending")} canMake canChange making={false} weekly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Send it back" }));
    expect((screen.getByRole("button", { name: "Send it back" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Why are you sending it back?"), { target: { value: "weak_copy" } });
    fireEvent.change(screen.getByLabelText("Anything to add (optional)"), { target: { value: "Too plain" } });
    fireEvent.click(screen.getByRole("button", { name: "Send it back" }));
    await waitFor(() => expect(vi.mocked(decideCarouselAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(decideCarouselAction).mock.calls[0]?.[0] as FormData;
    expect([form.get("id"), form.get("action"), form.get("reason"), form.get("comment")]).toEqual(["c1", "reject", "weak_copy", "Too plain"]);
  });

  it("says when an approved carousel goes out, and offers no decision", () => {
    render(<CarouselCard summary={summary("approved")} detail={detail("approved")} canMake canChange making={false} weekly={false} />);
    expect(screen.getByText(/Approved\. It goes out on Wednesday 18 November\./)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("offers to make it again after it was sent back or a slide did not pass the checks", async () => {
    const { rerender } = render(<CarouselCard summary={summary("rejected")} detail={detail("rejected")} canMake canChange making={false} weekly={false} />);
    expect(screen.getByText("Sent back")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Make it again" }));
    await waitFor(() => expect(vi.mocked(makeCarouselAction)).toHaveBeenCalledTimes(1));
    rerender(<CarouselCard summary={summary("blocked")} detail={detail("blocked")} canMake canChange making={false} weekly={false} />);
    expect(screen.getByText("A slide did not pass our checks")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Make it again" })).toBeTruthy();
  });

  it("shows the posting service's sentence when this week's carousel was already made", async () => {
    vi.mocked(makeCarouselAction).mockResolvedValueOnce({ status: "error", message: "You have made this week's carousel. You can make another from Monday 23 November." });
    render(<CarouselCard summary={summary("rejected")} detail={detail("rejected")} canMake canChange making={false} weekly={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Make it again" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Monday 23 November");
  });

  it("lets a viewer look at the carousel but not decide it", () => {
    render(<CarouselCard summary={summary("pending")} detail={detail("pending")} canMake canChange={false} making={false} weekly={false} />);
    expect(slidesOf()).toHaveLength(3);
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows the weekly switch as it stands and sends the new choice", async () => {
    const { rerender } = render(<CarouselCard summary={undefined} detail={null} canMake canChange making={false} weekly={false} />);
    const box = screen.getByRole<HTMLInputElement>("checkbox", { name: "Make a carousel for me every week" });
    expect(box.checked).toBe(false);
    fireEvent.click(box);
    await waitFor(() => expect(vi.mocked(setWeeklyCarouselAction).mock.calls[0]?.[0].get("enabled")).toBe("on"));
    rerender(<CarouselCard summary={undefined} detail={null} canMake canChange making={false} weekly />);
    expect(screen.getByRole<HTMLInputElement>("checkbox", { name: "Make a carousel for me every week" }).checked).toBe(true);
  });

  it("does not offer the weekly switch to a viewer or before an account is connected", () => {
    const { rerender } = render(<CarouselCard summary={summary("pending")} detail={detail("pending")} canMake canChange={false} making={false} weekly={false} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
    rerender(<CarouselCard summary={summary("pending")} detail={detail("pending")} canMake={false} canChange making={false} weekly={false} />);
    expect(screen.queryByRole("checkbox")).toBeNull();
  });
});
