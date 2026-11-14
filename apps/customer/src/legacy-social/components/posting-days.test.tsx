import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const save = vi.hoisted(() => vi.fn());
vi.mock("@/legacy-social/actions", () => ({ setPostingDaysAction: save }));

import { PostingDays } from "./posting-days";

afterEach(() => {
  cleanup();
  save.mockReset();
});

describe("PostingDays", () => {
  it("says the saved days, or the usual spread", () => {
    render(<PostingDays platform="instagram" days={["mon", "tue", "sat"]} canChange />);
    expect(screen.getByText("Mon, Tue, Sat")).toBeTruthy();
    cleanup();
    render(<PostingDays platform="facebook" days={[]} canChange />);
    expect(screen.getByText("Usual spread")).toBeTruthy();
  });

  it("offers no way to change for someone who may only read", () => {
    render(<PostingDays platform="instagram" days={["mon"]} canChange={false} />);
    expect(screen.queryByRole("button", { name: "Change" })).toBeNull();
  });

  it("opens with the saved days ticked, and saves the days chosen, in week order", async () => {
    save.mockResolvedValue({ status: "saved" });
    render(<PostingDays platform="instagram" days={["mon", "tue", "sat"]} canChange />);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    expect(screen.getByRole("button", { name: "Monday" }).getAttribute("aria-pressed")).toBe("true");
    expect(screen.getByRole("button", { name: "Wednesday" }).getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(screen.getByRole("button", { name: "Tuesday" }));
    fireEvent.click(screen.getByRole("button", { name: "Friday" }));
    fireEvent.click(screen.getByRole("button", { name: "Save days" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    const form = save.mock.calls[0]?.[0] as FormData;
    expect(form.get("channel")).toBe("instagram");
    expect(form.get("days")).toBe("mon,fri,sat");
    await waitFor(() => expect(screen.queryByRole("button", { name: "Save days" })).toBeNull());
  });

  it("will not save with no day chosen, and the usual spread sends no days", async () => {
    save.mockResolvedValue({ status: "saved" });
    render(<PostingDays platform="facebook" days={["wed"]} canChange />);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("button", { name: "Wednesday" }));
    expect((screen.getByRole("button", { name: "Save days" }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Usual spread" }));
    await waitFor(() => expect(save).toHaveBeenCalledTimes(1));
    expect((save.mock.calls[0]?.[0] as FormData).get("days")).toBe("");
  });

  it("shows what the posting service refused and keeps the choice open", async () => {
    save.mockResolvedValue({ status: "error", message: "Choose at least one day of the week." });
    render(<PostingDays platform="instagram" days={["mon"]} canChange />);
    fireEvent.click(screen.getByRole("button", { name: "Change" }));
    fireEvent.click(screen.getByRole("button", { name: "Save days" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Choose at least one day");
    expect(screen.getByRole("button", { name: "Save days" })).toBeTruthy();
  });
});
