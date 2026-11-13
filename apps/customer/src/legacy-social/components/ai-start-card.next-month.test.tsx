import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SiteJob } from "@/legacy-social/lib/social/ai";
import { startNextMonthAction } from "@/legacy-social/actions";
import { AiStartCard } from "./ai-start-card";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/legacy-social/actions", () => ({ startNextMonthAction: vi.fn(async () => ({ status: "saved" })), startSiteJobAction: vi.fn() }));

const done: SiteJob = { id: "j1", kind: "write", state: "done", createdAt: "2026-11-12T10:00:00Z" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AiStartCard: the next month", () => {
  it("offers the next month once the posting service says it can start, and asks for that Monday", async () => {
    render(<AiStartCard jobs={[done]} channels={[]} nextMonth={{ startDate: "2026-12-14", endsOn: "2026-12-11" }} />);
    expect(screen.getByText("Write your next month")).toBeTruthy();
    expect(screen.getByText(/Your posts run until 11 December/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Write my next month" }));
    await waitFor(() => expect(vi.mocked(startNextMonthAction)).toHaveBeenCalledTimes(1));
    expect((vi.mocked(startNextMonthAction).mock.calls[0]?.[0] as FormData).get("startDate")).toBe("2026-12-14");
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("says in words what went wrong and stays on the card when the posting service refuses", async () => {
    vi.mocked(startNextMonthAction).mockResolvedValueOnce({ status: "error", message: "Connect an account for that network first, then try again." });
    render(<AiStartCard jobs={[done]} channels={[]} nextMonth={{ startDate: "2026-12-14", endsOn: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Write my next month" }));
    expect(await screen.findByRole("alert")).toBeTruthy();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows nothing for a batch that is written and has no next month to offer, as before", () => {
    const { container } = render(<AiStartCard jobs={[done]} channels={[]} nextMonth={null} />);
    expect(container.textContent).toBe("");
  });
});
