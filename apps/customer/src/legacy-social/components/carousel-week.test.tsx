import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CarouselDetail, CarouselSummary } from "@/legacy-social/lib/social/carousel";
import { decideCarouselAction, drawCarouselAction } from "@/legacy-social/review-actions";
import { CarouselPictures, CarouselTopic, carouselFor, carouselInWeek, slideHeadlines, type WeekCarousel } from "./carousel-week";

vi.mock("@/legacy-social/review-actions", () => ({ decideCarouselAction: vi.fn(async () => ({ status: "saved" })), drawCarouselAction: vi.fn(async () => ({ status: "saved" })) }));

const make = (status: CarouselSummary["status"], canChange = true): WeekCarousel => ({
  summary: { id: "c1", topic: "Diwali boxes", date: "2026-11-18", count: 3, status, headlines: ["Why boxes sell out", "What is inside", "Order before Friday"] },
  detail: { id: "c1", count: 3, status, slides: [1, 2, 3].map((position) => ({ position, status })), captions: [{ network: "instagram", caption: "Fresh sweets.", status }], reasons: ["weak_copy"] } satisfies CarouselDetail,
  canChange,
});

const formOf = (action: unknown): FormData => vi.mocked(action as typeof decideCarouselAction).mock.calls[0]?.[0] as FormData;

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("carouselInWeek", () => {
  it("is true only for a carousel dated inside the week", () => {
    expect(carouselInWeek(make("topic"), "2026-11-16", "2026-11-22")).toBe(true);
    expect(carouselInWeek(make("topic"), "2026-11-23", "2026-11-29")).toBe(false);
    expect(carouselInWeek(null, "2026-11-16", "2026-11-22")).toBe(false);
  });
});

describe("carouselFor", () => {
  it("is for every channel it was written for, and for every channel when that is not known", () => {
    const written = make("topic");
    expect(carouselFor(written, "instagram")).toBe(true);
    expect(carouselFor(written, "facebook")).toBe(false);
    expect(carouselFor(written, "all")).toBe(true);
    expect(carouselFor({ ...written, detail: null }, "facebook")).toBe(true);
  });
});

describe("slideHeadlines", () => {
  it("takes the headlines from the list, and from the slides when the list has none", () => {
    expect(slideHeadlines(make("topic")).map((slide) => slide.headline)).toEqual(["Why boxes sell out", "What is inside", "Order before Friday"]);
    const bare = make("topic");
    const withSlides: WeekCarousel = { ...bare, summary: { ...bare.summary, headlines: [] }, detail: bare.detail === null ? null : { ...bare.detail, slides: [{ position: 1, status: "topic", headline: "From the slide" }] } };
    expect(slideHeadlines(withSlides)).toEqual([{ position: 1, headline: "From the slide" }]);
  });
});

describe("CarouselTopic", () => {
  it("shows a topic as not decided and keeps it", async () => {
    render(<CarouselTopic carousel={make("topic")} />);
    expect(screen.getByText("Not decided")).toBeTruthy();
    expect(screen.getByText(/Why boxes sell out/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(vi.mocked(decideCarouselAction)).toHaveBeenCalledTimes(1));
    expect(formOf(decideCarouselAction).get("action")).toBe("keep");
  });

  it("drops a topic, and undoes a kept one", async () => {
    render(<CarouselTopic carousel={make("topic")} />);
    fireEvent.click(screen.getByRole("button", { name: "Drop" }));
    await waitFor(() => expect(vi.mocked(decideCarouselAction)).toHaveBeenCalledTimes(1));
    expect(formOf(decideCarouselAction).get("action")).toBe("drop");
    cleanup();
    vi.clearAllMocks();
    render(<CarouselTopic carousel={make("kept")} />);
    expect(screen.getByText("Kept")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(vi.mocked(decideCarouselAction)).toHaveBeenCalledTimes(1));
    expect(formOf(decideCarouselAction).get("action")).toBe("reset");
  });

  it("offers no choices to a viewer", () => {
    render(<CarouselTopic carousel={make("topic", false)} />);
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("CarouselPictures", () => {
  it("says nothing is decided and shows no slides before it is kept", () => {
    render(<CarouselPictures carousel={make("topic")} channel="instagram" />);
    expect(screen.getByText(/Nothing is decided yet/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("draws a kept carousel from here, and shows no slides until they are drawn", async () => {
    render(<CarouselPictures carousel={make("kept")} channel="instagram" />);
    expect(screen.queryByRole("img")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Draw the carousel" }));
    await waitFor(() => expect(vi.mocked(drawCarouselAction)).toHaveBeenCalledTimes(1));
    expect(formOf(drawCarouselAction).get("id")).toBe("c1");
  });

  it("says the slides are being drawn", () => {
    render(<CarouselPictures carousel={make("drawing")} channel="instagram" />);
    expect(screen.getByText("Drawing the carousel's slides")).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the drawn slides and the channel's words, and approves them", async () => {
    render(<CarouselPictures carousel={make("pending")} channel="instagram" />);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByText("Fresh sweets.")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Approve the carousel" }));
    await waitFor(() => expect(vi.mocked(decideCarouselAction)).toHaveBeenCalledTimes(1));
    expect(formOf(decideCarouselAction).get("action")).toBe("approve");
  });

  it("shows nothing to look at for a dropped carousel", () => {
    render(<CarouselPictures carousel={make("dropped")} channel="instagram" />);
    expect(screen.getByText(/Dropped, nothing to show/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });
});
