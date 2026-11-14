import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AppLayout from "./layout";

const mockHeaders = vi.fn(async () => new Headers());
vi.mock("next/headers", () => ({
  headers: () => mockHeaders(),
}));

const mockRedirect = vi.fn((href: string) => {
  throw new Error(`redirect:${href}`);
});
vi.mock("next/navigation", () => ({
  redirect: (href: string) => mockRedirect(href),
}));

vi.mock("@/lib/guards", () => ({
  requireCustomer: vi.fn(async () => ({
    user: { id: "u-1", name: "Riley", email: "riley@example.test", phone: null, emailConfirmed: true },
    tenant: { userId: "u-1", businessId: "b-1", businessName: "Acme", role: "owner" },
    businessId: "b-1",
    businessName: "Acme",
    role: "owner",
    billing: { status: "unpaid", hasWebsite: true },
    services: ["website"],
    currency: "INR",
  })),
}));

const mockBusinessEntry: { kind: "website" | "listing"; signupChoice: "managed" | null } = {
  kind: "listing",
  signupChoice: "managed",
};

vi.mock("@/features/checkout/server/entry", () => ({
  loadBusinessEntry: vi.fn(async () => mockBusinessEntry),
  isAwaitingFirstPayment: (entry: { kind: string; signupChoice: string }) =>
    entry.kind === "listing" && entry.signupChoice === "managed",
}));

vi.mock("@/features/shell/loader", () => ({
  loadShell: vi.fn(async () => ({
    business: { name: "Acme", services: ["website"] },
    person: { name: "Riley", contact: "riley@example.test", role: "owner" },
    enquiries: { ok: true, data: 0 },
    requests: { ok: true, data: 0 },
    reports: { ok: true, data: false },
    banner: null,
    notifications: { ok: true, data: { items: [], unreadCount: 0 } },
  })),
}));

vi.mock("@/features/shell/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="app-shell">{children}</div>
  ),
}));

describe("AppLayout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockBusinessEntry.kind = "listing";
    mockBusinessEntry.signupChoice = "managed";
  });

  it("redirects unpaid accounts on dashboard (/) to /checkout", async () => {
    mockHeaders.mockResolvedValueOnce(new Headers({ "x-pathname": "/" }));
    await expect(AppLayout({ children: <p>Dashboard</p> })).rejects.toThrow("redirect:/checkout");
  });

  it("allows unpaid accounts to open /help without redirect", async () => {
    mockHeaders.mockResolvedValueOnce(new Headers({ "x-pathname": "/help" }));
    const result = await AppLayout({ children: <p>Help Content</p> });
    render(result);
    expect(screen.getByText("Help Content")).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows unpaid accounts to open /help/contact without redirect", async () => {
    mockHeaders.mockResolvedValueOnce(new Headers({ "x-pathname": "/help/contact" }));
    const result = await AppLayout({ children: <p>Contact Support</p> });
    render(result);
    expect(screen.getByText("Contact Support")).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows unpaid accounts to open /settings without redirect", async () => {
    mockHeaders.mockResolvedValueOnce(new Headers({ "x-pathname": "/settings" }));
    const result = await AppLayout({ children: <p>Settings Profile</p> });
    render(result);
    expect(screen.getByText("Settings Profile")).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows unpaid accounts to open /settings/team without redirect", async () => {
    mockHeaders.mockResolvedValueOnce(new Headers({ "x-pathname": "/settings/team" }));
    const result = await AppLayout({ children: <p>Team Settings</p> });
    render(result);
    expect(screen.getByText("Team Settings")).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });

  it("allows paid accounts to open dashboard without redirect", async () => {
    mockBusinessEntry.kind = "website" as const;
    mockHeaders.mockResolvedValueOnce(new Headers({ "x-pathname": "/" }));
    const result = await AppLayout({ children: <p>Dashboard Content</p> });
    render(result);
    expect(screen.getByText("Dashboard Content")).toBeDefined();
    expect(mockRedirect).not.toHaveBeenCalled();
  });
});
