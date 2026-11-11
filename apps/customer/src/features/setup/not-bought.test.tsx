import { render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CustomerContext } from "@/lib/guards";
import { NotBought } from "./components/not-bought";
import { loadNotBought } from "./loader";
import { notBoughtView } from "./rules";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }), unstable_rethrow: vi.fn() }));
vi.mock("@sentry/nextjs", () => ({ captureException: vi.fn(() => "event-1") }));
vi.mock("./loader", () => ({ loadNotBought: vi.fn(), loadSetupAsks: vi.fn() }));

const customer = (role: "owner" | "viewer" = "owner"): CustomerContext => ({ role, services: ["website"] }) as unknown as CustomerContext;

beforeEach(() => vi.resetAllMocks());

describe("NotBought", () => {
  it("says what the service does, what is included and the price with the offer, and offers Add to plan", async () => {
    vi.mocked(loadNotBought).mockResolvedValue(notBoughtView({ service: "social", held: [{ addOn: "managed-website", listCents: 299_900 }], forfeited: false, currency: "INR" }));
    render(await NotBought({ service: "social", customer: customer() }));
    expect(screen.getByRole("heading", { name: "Social & Ads", level: 1 })).toBeTruthy();
    expect(screen.getByText(/You approve every post before it goes out/)).toBeTruthy();
    expect(screen.getByText("Package offer, 10% off")).toBeTruthy();
    expect(screen.getByText("Prices are in rupees and include GST.")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Add to plan" }).getAttribute("href")).toBe("/billing?add=social");
    expect(screen.queryByText(/Waiting for your approval/)).toBeNull();
  });

  it("gives a viewer the page without the button", async () => {
    vi.mocked(loadNotBought).mockResolvedValue(notBoughtView({ service: "social", held: [], forfeited: false, currency: "INR" }));
    render(await NotBought({ service: "social", customer: customer("viewer") }));
    expect(screen.getByRole("heading", { name: "Social & Ads", level: 1 })).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Add to plan" })).toBeNull();
  });

  it("shows an error, not a price of zero, when the price cannot be read", async () => {
    vi.mocked(loadNotBought).mockRejectedValue(new Error("down"));
    render(await NotBought({ service: "social", customer: customer() }));
    expect(screen.getByText("We could not load the price of Social & Ads.")).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Add to plan" })).toBeNull();
  });
});
