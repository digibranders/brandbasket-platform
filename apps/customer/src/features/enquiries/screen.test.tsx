import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import { ToastProvider } from "@/ui";
import { EnquiriesScreen } from "./components/enquiries-screen";
import { loadChatAssistant, loadEnquiries, type EnquiriesView } from "./loader";
import { buildRows, summarise, type EnquiryRecord } from "./rules";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }), unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message.startsWith("NEXT_")) throw error; } }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("./loader", () => ({ loadEnquiries: vi.fn(), loadChatAssistant: vi.fn() }));
vi.mock("./actions", () => ({ saveEnquiryAction: vi.fn(), openConversationAction: vi.fn(), renameChatbotAction: vi.fn() }));

const NOW = new Date("2026-11-03T06:30:00Z");
const customer = (over: Partial<CustomerContext> = {}): CustomerContext =>
  ({ role: "owner", services: ["website"], billing: { status: "paid" }, businessId: "b1", tenant: {}, ...over }) as unknown as CustomerContext;

function records(): EnquiryRecord[] {
  const base = { source: null, email: null, note: null, status: "new" as const };
  return [
    { ...base, id: "1", kind: "chat", name: "Priya Nair", phone: "98190 55012", message: "Asked about thyroid profile", receivedAt: new Date("2026-11-03T04:00:00Z"), sourceRef: "chatbot_lead:0199a1b2-c3d4-7e5f-8a9b-0c1d2e3f4a5b" },
    { ...base, id: "2", kind: "call_tap", name: null, phone: null, message: null, receivedAt: new Date("2026-11-02T04:00:00Z"), sourceRef: "site_event:1" },
  ];
}

function view(): EnquiriesView {
  const rows = buildRows(records());
  return { rows, summary: summarise(rows, NOW, true), truncated: false, now: NOW };
}

const wrap = (node: ReactNode, search = "") =>
  render(
    <NuqsTestingAdapter searchParams={search}>
      <ToastProvider>{node}</ToastProvider>
    </NuqsTestingAdapter>,
  );

beforeEach(() => vi.resetAllMocks());

describe("EnquiriesScreen", () => {
  it("shows an error state, never an empty list, when the enquiries cannot be read", async () => {
    vi.mocked(loadEnquiries).mockRejectedValue(new Error("connection refused"));
    wrap(await EnquiriesScreen({ customer: customer(), params: {} }));
    expect(screen.getByText("We could not load your enquiries.")).toBeTruthy();
    expect(screen.queryByText("No enquiries yet")).toBeNull();
    expect(screen.getByRole("button", { name: "Try again" })).toBeTruthy();
  });

  it("shows the chat tab's error state when the chatbot cannot be read", async () => {
    vi.mocked(loadChatAssistant).mockRejectedValue(new Error("down"));
    wrap(await EnquiriesScreen({ customer: customer(), params: { tab: "chat" } }));
    expect(screen.getByText("We could not load your chatbot.")).toBeTruthy();
    expect(screen.queryByText("Your chatbot is not set up yet")).toBeNull();
  });

  it("lists a person with Call and WhatsApp, and a tap as Counted with no reply action", async () => {
    vi.mocked(loadEnquiries).mockResolvedValue(view());
    wrap(await EnquiriesScreen({ customer: customer(), params: {} }));
    const table = screen.getByRole("table", { name: "Enquiries" });
    const priya = within(table).getByText("Priya Nair").closest("tr");
    expect(priya).not.toBeNull();
    expect(within(priya as HTMLElement).getByRole("link", { name: "Call Priya Nair" }).getAttribute("href")).toBe("tel:+919819055012");
    expect(within(priya as HTMLElement).getByRole("link", { name: "WhatsApp Priya Nair" }).getAttribute("href")).toBe("https://wa.me/919819055012");
    const tap = within(table).getByText("Call button tap").closest("tr");
    expect(within(tap as HTMLElement).getByText("Counted")).toBeTruthy();
    expect(within(tap as HTMLElement).queryByRole("link")).toBeNull();
  });

  it("opens an anonymous inspector for a tap, with nothing to reply to or save", async () => {
    vi.mocked(loadEnquiries).mockResolvedValue(view());
    wrap(await EnquiriesScreen({ customer: customer(), params: {} }), "?open=2");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText(/not who called/)).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
    expect(within(dialog).queryByRole("link", { name: "Call" })).toBeNull();
  });

  it("opens the sheet of a person with Call, a status and a note for an owner", async () => {
    vi.mocked(loadEnquiries).mockResolvedValue(view());
    wrap(await EnquiriesScreen({ customer: customer(), params: {} }), "?open=1");
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByRole("link", { name: "Call" }).getAttribute("href")).toBe("tel:+919819055012");
    expect(within(dialog).getByText("Asked about thyroid profile")).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "Save" })).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: "View conversation" })).toBeTruthy();
    expect(within(dialog).getByLabelText("Private note")).toBeTruthy();
  });

  it("hides the status and note form from a viewer and from a lapsed business", async () => {
    vi.mocked(loadEnquiries).mockResolvedValue(view());
    for (const who of [customer({ role: "viewer" }), customer({ billing: { status: "lapsed" } } as never)]) {
      const { unmount } = wrap(await EnquiriesScreen({ customer: who, params: {} }), "?open=1");
      const dialog = await screen.findByRole("dialog");
      expect(within(dialog).queryByRole("button", { name: "Save" })).toBeNull();
      expect(within(dialog).getByRole("link", { name: "Call" })).toBeTruthy();
      unmount();
    }
  });

  it("shows no chat tab to a business without the Managed Website, and the export link only on the list", async () => {
    vi.mocked(loadEnquiries).mockResolvedValue(view());
    wrap(await EnquiriesScreen({ customer: customer({ services: ["social"] }), params: { tab: "chat" } }));
    expect(screen.queryByRole("link", { name: "Chat assistant" })).toBeNull();
    expect(screen.getByRole("link", { name: "Export" }).getAttribute("href")).toBe("/enquiries/export");
  });

  it("filters by status, with taps only under All", async () => {
    vi.mocked(loadEnquiries).mockResolvedValue(view());
    wrap(await EnquiriesScreen({ customer: customer(), params: { status: "new" } }));
    const table = screen.getByRole("table", { name: "Enquiries" });
    expect(within(table).getByText("Priya Nair")).toBeTruthy();
    expect(within(table).queryByText("Call button tap")).toBeNull();
  });

  it("says no enquiries match when a filter leaves nothing, and offers to clear it", async () => {
    vi.mocked(loadEnquiries).mockResolvedValue(view());
    wrap(await EnquiriesScreen({ customer: customer(), params: { status: "won" } }));
    expect(screen.getByText("No enquiries match")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Clear filters" }).getAttribute("href")).toBe("/enquiries");
  });

  it("opens the sheet without a chat conversation button for a non-chat person", async () => {
    const user = userEvent.setup();
    vi.mocked(loadEnquiries).mockResolvedValue(view());
    wrap(await EnquiriesScreen({ customer: customer(), params: {} }));
    await user.click(screen.getByRole("button", { name: "Call button tap" }));
    expect(await screen.findByRole("dialog")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "View conversation" })).toBeNull();
  });
});
