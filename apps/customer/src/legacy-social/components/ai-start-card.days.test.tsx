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

  it("offers nothing when every channel has its posts written, and no longer says automatic posting is not available", () => {
    const { container } = render(<AiStartCard jobs={[done]} channels={[]} website="acme.com" />);
    expect(container.textContent).toBe("");
    cleanup();
    render(<StartDialog connected={new Set(["instagram"] as const)} website="acme.com" onClose={() => undefined} />);
    expect(screen.queryByText(/Not available yet/)).toBeNull();
  });


  it("lets her choose Post automatically when a channel is connected, asks for her agreement, and sends it with the wait", async () => {
    render(<StartDialog connected={new Set(["instagram"] as const)} website="acme.com" onClose={() => undefined} />);
    const auto = screen.getByRole("radio", { name: /Post automatically/ }) as HTMLInputElement;
    expect(auto.disabled).toBe(false);
    fireEvent.click(auto);
    fireEvent.change(screen.getByLabelText("We approve a picture"), { target: { value: "48" } });
    fireEvent.click(screen.getByRole("button", { name: "Read my website" }));
    expect(screen.getByText(/Tick the box to agree/)).toBeTruthy();
    expect(vi.mocked(startSiteJobAction)).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("checkbox", { name: /I agree that Brandbasket may approve/ }));
    fireEvent.click(screen.getByRole("button", { name: "Read my website" }));
    await waitFor(() => expect(vi.mocked(startSiteJobAction)).toHaveBeenCalledTimes(1));
    const form = vi.mocked(startSiteJobAction).mock.calls[0]?.[0] as FormData;
    expect([form.get("approval"), form.get("hours"), form.get("agreed")]).toEqual(["automatic", "48", "yes"]);
  });

  it("keeps Post automatically off while none of the chosen channels is connected, and sends manual by default", async () => {
    render(<StartDialog connected={new Set()} website="acme.com" onClose={() => undefined} />);
    expect((screen.getByRole("radio", { name: /Post automatically/ }) as HTMLInputElement).disabled).toBe(true);
    expect(screen.getByText(/Connect an account for one of these channels first/)).toBeTruthy();
    cleanup();
    render(<StartDialog connected={new Set(["instagram"] as const)} website="acme.com" onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Read my website" }));
    await waitFor(() => expect(vi.mocked(startSiteJobAction)).toHaveBeenCalledTimes(1));
    expect((vi.mocked(startSiteJobAction).mock.calls[0]?.[0] as FormData).get("approval")).toBe("manual");
  });

  it("is the first start card when nothing is written yet, with its button", () => {
    render(<AiStartCard jobs={[]} channels={[]} website={null} />);
    expect(screen.getByRole("button", { name: "Start from my website" })).toBeTruthy();
  });
});
