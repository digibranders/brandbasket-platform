import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StartView } from "../loader";
import { StartScreen } from "./start-screen";

vi.mock("../actions", () => ({ continueToCheckoutAction: vi.fn(), saveAnswerAction: vi.fn(), toggleServiceAction: vi.fn() }));

const VIEW: StartView = {
  phase: "before-payment",
  services: ["managed-website"],
  step: {
    kind: "question",
    question: { field: "goal", kind: "single", title: "What matters most?", hint: "Pick one.", options: [{ value: "calls", label: "More calls" }], saved: [], optional: false, number: 1, total: 5, askedBecause: null, backHref: null },
  },
  aside: { ok: true, data: null },
};

describe("StartScreen", () => {
  it("says which question it is on once", () => {
    const { container } = render(<StartScreen view={VIEW} />);
    expect(container.textContent?.match(/Question 1 of 5/g)).toHaveLength(1);
  });

  const SUMMARY: StartView["step"] = {
    kind: "summary",
    summary: { rows: [{ field: "businessType", label: "Business", value: "Clinic" }], prices: { "managed-website": "₹2,999", "social-media": "₹1 first month, then ₹2,999" }, unanswered: 0, firstUnansweredHref: null },
  };
  const ASIDE = { rows: [{ key: "website", label: "Website", amount: "Free", tone: "free" as const }], total: "₹2,999", taxed: true, adCredit: null, changeHref: null, firstMonthPlans: [] };

  it("before payment shows the prices, the basket buttons and Continue to checkout", () => {
    const { container, getByRole } = render(<StartScreen view={{ ...VIEW, step: SUMMARY, aside: { ok: true, data: ASIDE } }} />);
    expect(container.textContent).toContain("Due today");
    expect(container.textContent).toContain("₹2,999 a month");
    expect(getByRole("button", { name: "Remove Website Management" })).toBeTruthy();
    expect(getByRole("button", { name: "Continue to checkout" })).toBeTruthy();
  });

  it("after payment shows no price, no basket buttons and no Change services, and ends with Finish", () => {
    const { container, getByRole, queryByRole, queryByText } = render(<StartScreen view={{ ...VIEW, phase: "after-payment", step: SUMMARY }} />);
    expect(container.textContent).not.toMatch(/₹|\$|Due today|a month|GST|Change services|checkout/i);
    expect(container.querySelector("aside, article")).toBeNull();
    expect(queryByText("Your services")).toBeNull();
    expect(queryByRole("button", { name: /^(Add|Remove) / })).toBeNull();
    expect(queryByRole("button", { name: "Continue to checkout" })).toBeNull();
    expect(getByRole("button", { name: "Finish" })).toBeTruthy();
  });

  it("after payment asks the question with no aside, and keeps Skip for now", () => {
    const { container, getByRole } = render(<StartScreen view={{ ...VIEW, phase: "after-payment" }} />);
    expect(container.textContent).toContain("What matters most?");
    expect(container.querySelector("article")).toBeNull();
    expect(getByRole("button", { name: "Skip for now" })).toBeTruthy();
  });
});
