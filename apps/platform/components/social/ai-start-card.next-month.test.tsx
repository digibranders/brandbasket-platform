// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SiteJob } from "@/lib/social/ai";
import { button, click, mount, settle, type Mounted } from "./dom-test";
import { AiStartCard } from "./ai-start-card";

const { refresh, startNextMonth } = vi.hoisted(() => ({ refresh: vi.fn(), startNextMonth: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));
vi.mock("@/app/app-host/(protected)/social/actions", () => ({ startNextMonthAction: startNextMonth, startSiteJobAction: vi.fn() }));

const done: SiteJob = { id: "j1", kind: "write", state: "done", createdAt: "2026-11-12T10:00:00Z" };

let view: Mounted;
beforeEach(() => {
  vi.resetAllMocks();
  startNextMonth.mockResolvedValue({ status: "saved" });
  view = mount();
});
afterEach(() => view.unmount());

describe("AiStartCard: the next month", () => {
  it("offers the next month once social-auto says it can start, and asks for that Monday", async () => {
    await view.render(<AiStartCard jobs={[done]} channels={[]} nextMonth={{ startDate: "2026-12-14", endsOn: "2026-12-11" }} />);
    expect(view.container.textContent).toContain("Write your next month");
    expect(view.container.textContent).toContain("Your posts run until 11 December");
    await click(button(view.container, "Write my next month"));
    expect((startNextMonth.mock.calls[0]?.[0] as FormData).get("startDate")).toBe("2026-12-14");
    expect(refresh).toHaveBeenCalled();
  });

  it("says in words what went wrong and stays on the card when social-auto refuses", async () => {
    startNextMonth.mockResolvedValueOnce({ status: "error", message: "Connect an account for that network first, then try again." });
    await view.render(<AiStartCard jobs={[done]} channels={[]} nextMonth={{ startDate: "2026-12-14", endsOn: null }} />);
    await click(button(view.container, "Write my next month"));
    await settle();
    expect(view.container.querySelector('[role="alert"]')?.textContent).toContain("Connect an account");
    expect(refresh).not.toHaveBeenCalled();
  });

  it("shows nothing for a batch that is written and has no next month to offer, as before", async () => {
    await view.render(<AiStartCard jobs={[done]} channels={[]} nextMonth={null} />);
    expect(view.container.textContent).toBe("");
  });
});
