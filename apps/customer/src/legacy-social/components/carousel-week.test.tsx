import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { CarouselDetail, CarouselSummary } from "@/legacy-social/lib/social/carousel";
import { decideCarouselAction } from "@/legacy-social/review-actions";
import { CarouselPictures, CarouselTopic, carouselInWeek, type WeekCarousel } from "./carousel-week";

vi.mock("@/legacy-social/review-actions", () => ({ decideCarouselAction: vi.fn(async () => ({ status: "saved" })) }));

const make = (status: CarouselSummary["status"], canChange = true): WeekCarousel => ({
  summary: { id: "c1", topic: "Diwali boxes", date: "2026-11-18", count: 3, status },
  detail: { id: "c1", count: 3, status, slides: [1, 2, 3].map((position) => ({ position, status })), captions: [{ network: "instagram", caption: "Fresh sweets.", status }], reasons: ["weak_copy"] } satisfies CarouselDetail,
  canChange,
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("carouselInWeek", () => {
  it("is true only for a carousel dated inside the week", () => {
    expect(carouselInWeek(make("pending"), "2026-11-16", "2026-11-22")).toBe(true);
    expect(carouselInWeek(make("pending"), "2026-11-23", "2026-11-29")).toBe(false);
    expect(carouselInWeek(null, "2026-11-16", "2026-11-22")).toBe(false);
  });
});

describe("CarouselTopic", () => {
  it("shows the topic as not decided and keeps it", async () => {
    render(<CarouselTopic carousel={make("pending")} />);
    expect(screen.getByText("Not decided")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Keep" }));
    await waitFor(() => expect(vi.mocked(decideCarouselAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(decideCarouselAction).mock.calls[0]?.[0] as FormData;
    expect(form.get("id")).toBe("c1");
    expect(form.get("action")).toBe("approve");
  });

  it("shows kept without buttons once approved", () => {
    render(<CarouselTopic carousel={make("approved")} />);
    expect(screen.getByText("Kept")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Keep" })).toBeNull();
  });
});

describe("CarouselPictures", () => {
  it("shows nothing but that nothing is decided before it is kept", () => {
    render(<CarouselPictures carousel={make("pending")} channel="instagram" />);
    expect(screen.getByText(/Nothing is decided yet/)).toBeTruthy();
    expect(screen.queryByRole("img")).toBeNull();
  });

  it("shows the slides and the channel's words once kept", () => {
    render(<CarouselPictures carousel={make("approved")} channel="instagram" />);
    expect(screen.getAllByRole("img")).toHaveLength(3);
    expect(screen.getByText("Fresh sweets.")).toBeTruthy();
  });
});
