import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { StartView } from "../loader";
import { StartScreen } from "./start-screen";

vi.mock("../actions", () => ({ continueToCheckoutAction: vi.fn(), saveAnswerAction: vi.fn(), toggleServiceAction: vi.fn() }));

const VIEW: StartView = {
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
});
