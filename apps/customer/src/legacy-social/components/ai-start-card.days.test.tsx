import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { startNextMonthAction, startSiteJobAction } from "@/legacy-social/actions";
import type { SiteJob } from "@/legacy-social/lib/social/ai";
import { AiStartCard, StartDialog } from "./ai-start-card";

const refresh = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/legacy-social/actions", () => ({ startNextMonthAction: vi.fn(async () => ({ status: "saved" })), startSiteJobAction: vi.fn(async () => ({ status: "saved" })) }));

const done: SiteJob = { id: "j1", kind: "write", state: "done", createdAt: "2026-11-12T10:00:00Z" };

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function showModal(this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("writing posts for channels that post on different days", () => {
  const connected = new Set(["instagram", "facebook"] as const);

  it("starts with the first group only, says the others follow, and sends only those channels", async () => {
    render(<StartDialog connected={connected} postingDays={{ instagram: ["mon", "tue", "sat"], facebook: ["wed", "fri"] }} website="acme.com" onClose={() => undefined} />);
    expect(screen.getByText(/post on different days/)).toBeTruthy();
    expect(screen.getByText(/start Facebook once these posts are written/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Read my website" }));
    await waitFor(() => expect(vi.mocked(startSiteJobAction)).toHaveBeenCalledTimes(1));
    expect((vi.mocked(startSiteJobAction).mock.calls[0]?.[0] as FormData).getAll("network")).toEqual(["instagram"]);
  });

  it("refuses to write for channels on different days together, in words", () => {
    render(<StartDialog connected={connected} postingDays={{ instagram: ["mon"], facebook: ["wed"] }} website="acme.com" onClose={() => undefined} />);
    fireEvent.click(screen.getByTitle("Facebook"));
    fireEvent.click(screen.getByRole("button", { name: "Read my website" }));
    expect(screen.getByText("These channels post on different days, so write them one at a time.")).toBeTruthy();
    expect(vi.mocked(startSiteJobAction)).not.toHaveBeenCalled();
  });

  it("changes nothing for channels on the same days, or when the days are not known", () => {
    render(<StartDialog connected={connected} postingDays={{ instagram: ["mon"], facebook: ["mon"] }} website="acme.com" onClose={() => undefined} />);
    expect(screen.queryByText(/post on different days/)).toBeNull();
    cleanup();
    render(<StartDialog connected={connected} postingDays={null} website="acme.com" onClose={() => undefined} />);
    expect(screen.queryByText(/post on different days/)).toBeNull();
  });

  it("says which group the next month was started for when the others follow", async () => {
    vi.mocked(startNextMonthAction).mockResolvedValueOnce({ status: "partial", message: "Started for Instagram. Facebook posts on different days, so it is written separately: start it once these posts are written." });
    render(<AiStartCard jobs={[done]} channels={[]} nextMonth={{ startDate: "2026-12-14", endsOn: null }} />);
    fireEvent.click(screen.getByRole("button", { name: "Write my next month" }));
    expect(await screen.findByText(/Started for Instagram/)).toBeTruthy();
    expect(refresh).toHaveBeenCalled();
  });
});
