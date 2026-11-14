import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { SiteJob } from "@/legacy-social/lib/social/ai";
import { AiStartCard } from "./ai-start-card";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/legacy-social/actions", () => ({ startNextMonthAction: vi.fn(async () => ({ status: "saved" })), startSiteJobAction: vi.fn(async () => ({ status: "saved" })) }));

afterEach(cleanup);

const failedDraw: SiteJob = { id: "j1", kind: "draw", state: "failed", createdAt: "2026-11-14T10:00:00Z", failure: "PICTURE_LIMIT_REACHED" };

describe("a draw that failed", () => {
  it("says so while a kept topic still has no pictures", () => {
    render(<AiStartCard jobs={[failedDraw]} channels={[]} drawWaiting />);
    expect(screen.getByText("We could not draw your pictures")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("says nothing once every kept topic has its pictures, so the old failure is not shown again", () => {
    render(<AiStartCard jobs={[failedDraw]} channels={[]} drawWaiting={false} />);
    expect(screen.queryByText("We could not draw your pictures")).toBeNull();
    expect(screen.queryByRole("button", { name: "Try again" })).toBeNull();
  });

  it("still says a failed write, whatever is waiting to be drawn", () => {
    render(<AiStartCard jobs={[{ ...failedDraw, kind: "write" }]} channels={[]} drawWaiting={false} />);
    expect(screen.getByText("We could not write your posts")).toBeTruthy();
  });
});
