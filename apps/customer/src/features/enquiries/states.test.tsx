import { render, screen } from "@testing-library/react";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import { ToastProvider } from "@/ui";
import { ChatAssistant } from "./components/chat-assistant";
import { EnquiriesScreen } from "./components/enquiries-screen";
import { loadEnquiries, type ChatAssistantView } from "./loader";
import { buildRows, summarise } from "./rules";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message.startsWith("NEXT_")) throw error; } }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("./loader", () => ({ loadEnquiries: vi.fn(), loadChatAssistant: vi.fn() }));
vi.mock("./actions", () => ({ saveEnquiryAction: vi.fn(), openConversationAction: vi.fn(), renameChatbotAction: vi.fn() }));

const NOW = new Date("2026-11-03T06:30:00Z");
const NOISE = /No data|undefined|\bnull\b|NaN/;
const FAILED = { ok: false, error: { at: NOW } } as const;
const customer = { role: "owner", services: ["website"], billing: { status: "paid" }, businessId: "b1", tenant: {} } as unknown as CustomerContext;
const wrap = (node: ReactNode) => render(<NuqsTestingAdapter><ToastProvider>{node}</ToastProvider></NuqsTestingAdapter>);

beforeEach(() => vi.resetAllMocks());

describe("Enquiries list states", () => {
  it("a failed list shows its own error under the page header, never the empty sentence", async () => {
    vi.mocked(loadEnquiries).mockRejectedValue(new Error("down"));
    wrap(await EnquiriesScreen({ customer, params: {} }));
    expect(screen.getByRole("alert").textContent).toContain("We could not load your enquiries.");
    expect(screen.getByRole("heading", { name: "Enquiries", level: 1 })).toBeTruthy();
    expect(screen.queryByText("No enquiries yet")).toBeNull();
  });

  it("an empty list says when enquiries will appear", async () => {
    const rows = buildRows([]);
    vi.mocked(loadEnquiries).mockResolvedValue({ rows, summary: summarise(rows, NOW, true), truncated: false, now: NOW });
    const { container } = wrap(await EnquiriesScreen({ customer, params: {} }));
    expect(screen.getByText("No enquiries yet")).toBeTruthy();
    expect(screen.getByText(/they appear here/)).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });
});

describe("Chat assistant states", () => {
  it("a failed read shows its own error and no chat figures", () => {
    render(<ChatAssistant data={FAILED} canEdit />);
    expect(screen.getByRole("alert").textContent).toContain("We could not load your chatbot.");
    expect(screen.getByRole("heading", { name: "Your chatbot" })).toBeTruthy();
    expect(screen.queryByText("Your chatbot is not set up yet")).toBeNull();
  });

  it("no chatbot yet says what the team does and offers one action", () => {
    const empty: ChatAssistantView = { bots: [], total: 0, lastWeek: 0, lastMonth: 0 };
    const { container } = render(<ChatAssistant data={{ ok: true, data: empty }} canEdit />);
    expect(screen.getByText("Your chatbot is not set up yet")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Ask the team" })).toBeTruthy();
    expect(container.textContent).not.toMatch(NOISE);
  });
});
