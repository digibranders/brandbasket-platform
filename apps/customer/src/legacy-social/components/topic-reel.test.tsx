import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { SplashText, TopicReel } from "./topic-reel";

afterEach(cleanup);

describe("SplashText", () => {
  it("keeps every letter on its own with a line through it, and reads as the whole text", () => {
    render(<SplashText text="Two words" splash={false} />);
    const text = screen.getByLabelText("Two words");
    expect(text.querySelectorAll(".line-through").length).toBe(8);
    expect(Array.from(text.querySelectorAll(".line-through")).every((letter) => (letter as HTMLElement).style.transform === "")).toBe(true);
  });

  it("sends each letter off on its own path, the same way every time", () => {
    const first = render(<SplashText text="Splash" splash />);
    const moves = Array.from(first.container.querySelectorAll<HTMLElement>(".line-through")).map((letter) => letter.style.transform);
    expect(new Set(moves).size).toBe(6);
    expect(Array.from(first.container.querySelectorAll<HTMLElement>(".line-through")).every((letter) => letter.style.opacity === "0")).toBe(true);
    first.unmount();
    const second = render(<SplashText text="Splash" splash />);
    expect(Array.from(second.container.querySelectorAll<HTMLElement>(".line-through")).map((letter) => letter.style.transform)).toEqual(moves);
  });
});

describe("TopicReel", () => {
  it("rolls the lines while the topic is written, saying so only to a screen reader", () => {
    render(<TopicReel lines={["One", "Two", "Three"]} arrived={null} />);
    expect(screen.getByRole("status").textContent).toContain("Writing a new topic for this day");
    expect(screen.getByRole("status").querySelector(".sr-only")).not.toBeNull();
    expect(screen.getAllByText("One").length).toBe(2);
  });

  it("lands on the topic that arrived", () => {
    render(<TopicReel lines={["One", "Two"]} arrived="The new topic" />);
    expect(screen.getByText("The new topic")).toBeTruthy();
  });
});
