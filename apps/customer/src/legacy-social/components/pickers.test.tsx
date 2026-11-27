import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DatePicker } from "./date-picker";
import { TimePicker } from "./time-picker";

afterEach(cleanup);

describe("DatePicker", () => {
  const props = { id: "d", value: "2026-12-01", min: "2026-11-27", max: "2027-02-24", today: "2026-11-27" };

  it("shows the day in words, opens a month calendar, and chooses a day that is allowed", () => {
    const onChange = vi.fn();
    render(<DatePicker {...props} onChange={onChange} />);
    expect(screen.getByRole("button", { name: /Tue, 1 Dec 2026/ })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Tue, 1 Dec 2026/ }));
    expect(screen.getByText("December 2026")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Friday,? 4 December 2026/ }));
    expect(onChange).toHaveBeenCalledWith("2026-12-04");
    // The calendar closes after a choice.
    expect(screen.queryByText("December 2026")).toBeNull();
  });

  it("greys out the days outside the allowed range, and the Today button follows it", () => {
    render(<DatePicker {...props} min="2026-12-02" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Tue, 1 Dec 2026/ }));
    expect((screen.getByRole("button", { name: /Tuesday,? 1 December 2026/ }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: /Wednesday,? 2 December 2026/ }) as HTMLButtonElement).disabled).toBe(false);
    expect((screen.getByRole("button", { name: "Today" }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole("button", { name: "Previous month" }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("moves between months, and Escape closes only the calendar", () => {
    render(<DatePicker {...props} onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /Tue, 1 Dec 2026/ }));
    fireEvent.click(screen.getByRole("button", { name: "Next month" }));
    expect(screen.getByText("January 2027")).toBeTruthy();
    const outer = vi.fn();
    document.addEventListener("keydown", outer);
    fireEvent.keyDown(screen.getByRole("group", { name: "Choose a day" }), { key: "Escape" });
    document.removeEventListener("keydown", outer);
    expect(screen.queryByRole("group", { name: "Choose a day" })).toBeNull();
    expect(outer).not.toHaveBeenCalled();
  });
});

describe("TimePicker", () => {
  it("shows the time in 12-hour words and changes the hour, the minute and AM or PM, keeping the rest", () => {
    const onChange = vi.fn();
    render(<TimePicker id="t" value="10:00" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /10:00 AM/ }));
    fireEvent.click(screen.getByRole("button", { name: "4" }));
    expect(onChange).toHaveBeenLastCalledWith("04:00");
    fireEvent.click(screen.getByRole("button", { name: "30" }));
    expect(onChange).toHaveBeenLastCalledWith("10:30");
    fireEvent.click(screen.getByRole("button", { name: "PM" }));
    expect(onChange).toHaveBeenLastCalledWith("22:00");
  });

  it("keeps a minute that is not a multiple of five as its own button, and closes with Done", () => {
    render(<TimePicker id="t" value="16:03" onChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: /4:03 PM/ }));
    expect((screen.getByRole("button", { name: "03" }) as HTMLButtonElement).getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByRole("button", { name: "Done" }));
    expect(screen.queryByRole("group", { name: "Choose a time" })).toBeNull();
  });
});
