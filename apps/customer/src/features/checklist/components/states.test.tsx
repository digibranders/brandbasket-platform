import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import ChecklistPage from "@/app/(app)/checklist/page";
import { readChecklistState, type ChecklistState } from "../loader";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), usePathname: () => "/checklist", unstable_rethrow: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("../loader", () => ({ readChecklistState: vi.fn() }));
vi.mock("@/lib/guards", () => ({ requirePaid: vi.fn(async () => ({ role: "owner", services: ["website"], businessId: "b1", tenant: {} }) as unknown as CustomerContext) }));

const NOISE = /No data|undefined|\bnull\b|NaN/;
const params = (item?: string) => Promise.resolve(item === undefined ? {} : { item });

beforeEach(() => {
  vi.mocked(readChecklistState).mockReset();
});

describe("Setup checklist states", () => {
  it("a failed read shows its own error under the real header, never the empty sentence", async () => {
    vi.mocked(readChecklistState).mockRejectedValue(new Error("down"));
    render(await ChecklistPage({ searchParams: params() }));
    expect(screen.getByRole("alert").textContent).toContain("We could not load your checklist.");
    expect(screen.getByRole("heading", { name: "Setup checklist", level: 1 })).toBeTruthy();
    expect(screen.queryByText("There's nothing to set up right now")).toBeNull();
  });

  it("nothing to set up says what will show here", async () => {
    const empty: ChecklistState = { services: ["website"], rows: [], snapshot: null, answers: {} as ChecklistState["answers"] };
    vi.mocked(readChecklistState).mockResolvedValue(empty);
    const { container } = render(await ChecklistPage({ searchParams: params() }));
    expect(screen.getByText("There's nothing to set up right now")).toBeTruthy();
    expect(screen.getByText("Anything we need from you will show here.")).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });
});
