import { fireEvent, render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { Input } from "./input";

describe("Input picker", () => {
  it("opens the time picker on a click anywhere in the box, but not for text or a disabled box", () => {
    const { container, rerender } = render(<Input type="time" aria-label="Opens" />);
    const input = container.querySelector("input") as HTMLInputElement;
    const showPicker = vi.fn();
    input.showPicker = showPicker;
    fireEvent.click(input);
    expect(showPicker).toHaveBeenCalledTimes(1);

    rerender(<Input type="time" aria-label="Opens" disabled />);
    fireEvent.click(input);
    rerender(<Input type="text" aria-label="Name" />);
    fireEvent.click(input);
    expect(showPicker).toHaveBeenCalledTimes(1);
  });
});
