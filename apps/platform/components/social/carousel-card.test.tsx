// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CarouselDetail, CarouselSummary } from "@/lib/social/carousel";
import { button, buttonsNamed, click, mount, settle, type, type Mounted } from "./dom-test";
import { CarouselCard, type CarouselCardProps } from "./carousel-card";

const { make, decide, weekly } = vi.hoisted(() => ({ make: vi.fn(), decide: vi.fn(), weekly: vi.fn() }));
vi.mock("@/app/app-host/(protected)/social/review/actions", () => ({ makeCarouselAction: make, decideCarouselAction: decide, setWeeklyCarouselAction: weekly }));

const summary = (status: CarouselSummary["status"]): CarouselSummary => ({ id: "c1", topic: "Diwali boxes", date: "2026-11-18", count: 3, status });
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
const props = (over: Partial<CarouselCardProps> = {}): CarouselCardProps => ({ summary: undefined, detail: null, canMake: true, making: false, weekly: false, ...over });

let view: Mounted;
beforeEach(() => {
  vi.resetAllMocks();
  make.mockResolvedValue({ status: "saved" });
  decide.mockResolvedValue({ status: "saved" });
  weekly.mockResolvedValue({ status: "saved" });
  view = mount();
});
afterEach(() => view.unmount());

const sentForm = (action: ReturnType<typeof vi.fn>): FormData => action.mock.calls[0]?.[0] as FormData;
const slides = (): HTMLImageElement[] => [...view.container.querySelectorAll<HTMLImageElement>('ol[aria-label="The slides of your carousel"] img')];
const weeklyBox = (): HTMLInputElement | null => view.container.querySelector<HTMLInputElement>('input[type="checkbox"]');

describe("CarouselCard", () => {
  it("offers to make this week's carousel when there is none and it can be made", async () => {
    await view.render(<CarouselCard {...props()} />);
    await click(button(view.container, "Make this week's carousel"));
    expect(make).toHaveBeenCalledTimes(1);
  });

  it("shows nothing when there is no carousel and none can be made (no website read, or no account connected)", async () => {
    await view.render(<CarouselCard {...props({ canMake: false })} />);
    expect(view.container.textContent).toBe("");
  });

  it("says it is being made, with no slides and no buttons yet, and does not offer to ask again", async () => {
    await view.render(<CarouselCard {...props({ summary: summary("incomplete"), detail: detail("incomplete"), making: true })} />);
    expect(view.container.textContent).toContain("We are making your carousel. This page updates when it is ready.");
    expect(slides()).toHaveLength(0);
    expect(view.container.querySelectorAll("button")).toHaveLength(0);
    await view.render(<CarouselCard {...props({ making: true })} />);
    expect(buttonsNamed(view.container, "Make this week's carousel")).toHaveLength(0);
  });

  it("shows every slide through our own route and the words for each channel, and approves the whole carousel", async () => {
    await view.render(<CarouselCard {...props({ summary: summary("pending"), detail: detail("pending") })} />);
    expect(slides()).toHaveLength(3);
    expect(slides()[1]?.getAttribute("src")).toBe("/api/social-carousels/slide?id=c1&slide=2");
    expect(view.container.textContent).toContain("Fresh sweets, boxed today.");
    expect(view.container.textContent).toContain("How a family sweet shop plans Diwali.");
    await click(button(view.container, "Approve the carousel"));
    expect([sentForm(decide).get("id"), sentForm(decide).get("action")]).toEqual(["c1", "approve"]);
  });

  it("sends the whole carousel back only with a reason, and passes the comment on", async () => {
    await view.render(<CarouselCard {...props({ summary: summary("pending"), detail: detail("pending") })} />);
    await click(button(view.container, "Send it back"));
    expect(button(view.container, "Send it back").disabled).toBe(true);
    await type(view.container.querySelector<HTMLSelectElement>("#carousel-reason") as HTMLSelectElement, "weak_copy");
    await type(view.container.querySelector<HTMLTextAreaElement>("#carousel-comment") as HTMLTextAreaElement, "Too plain");
    await click(button(view.container, "Send it back"));
    const form = sentForm(decide);
    expect([form.get("id"), form.get("action"), form.get("reason"), form.get("comment")]).toEqual(["c1", "reject", "weak_copy", "Too plain"]);
  });

  it("says when an approved carousel goes out, and offers no decision", async () => {
    await view.render(<CarouselCard {...props({ summary: summary("approved"), detail: detail("approved") })} />);
    expect(view.container.textContent).toContain("Approved. It goes out on Wednesday 18 November.");
    expect(view.container.querySelectorAll("button")).toHaveLength(0);
  });

  it("offers to make it again after it was sent back or a slide did not pass the checks", async () => {
    await view.render(<CarouselCard {...props({ summary: summary("rejected"), detail: detail("rejected") })} />);
    expect(view.container.textContent).toContain("Sent back");
    await click(button(view.container, "Make it again"));
    expect(make).toHaveBeenCalledTimes(1);
    await view.render(<CarouselCard {...props({ summary: summary("blocked"), detail: detail("blocked") })} />);
    expect(view.container.textContent).toContain("A slide did not pass our checks");
    expect(buttonsNamed(view.container, "Make it again")).toHaveLength(1);
  });

  it("shows the posting service's sentence when this week's carousel was already made", async () => {
    make.mockResolvedValueOnce({ status: "error", message: "You have made this week's carousel. You can make another from Monday 23 November." });
    await view.render(<CarouselCard {...props({ summary: summary("rejected"), detail: detail("rejected") })} />);
    await click(button(view.container, "Make it again"));
    await settle();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("Monday 23 November");
  });

  it("shows the weekly switch as it stands and sends the new choice", async () => {
    await view.render(<CarouselCard {...props()} />);
    expect(weeklyBox()?.checked).toBe(false);
    await click(weeklyBox() as HTMLInputElement);
    expect(sentForm(weekly).get("enabled")).toBe("on");
    await view.render(<CarouselCard {...props({ weekly: true })} />);
    expect(weeklyBox()?.checked).toBe(true);
  });

  it("does not offer the weekly switch before an account is connected", async () => {
    await view.render(<CarouselCard {...props({ summary: summary("pending"), detail: detail("pending"), canMake: false })} />);
    expect(weeklyBox()).toBeNull();
  });
});
