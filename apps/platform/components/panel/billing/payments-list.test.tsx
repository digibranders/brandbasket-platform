import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { BillingMonth } from "@/lib/billing/billing-months";
import { PaymentsList } from "./payments-list";

vi.mock("@/app/app-host/(protected)/billing/actions", () => ({ payChargeAction: vi.fn() }));

const row = {
  id: "r1",
  title: "Tax invoice FY/26-27/000001",
  description: "First payment, covering your first month",
  paidAtIso: "2026-10-27T06:00:00.000Z",
  status: "Paid",
  statusDetail: null,
  tone: "paid" as const,
  amount: "₹2,999",
  plan: "Brandbasket services plan",
  downloadable: true,
};
const months: BillingMonth[] = [
  {
    key: "2026-10",
    label: "October 2026",
    total: "₹2,999",
    lines: [
      { kind: "receipt", row },
      { kind: "due", chargeId: "c1", title: "Extra page: Gallery", addedIso: "2026-10-27T06:00:00.000Z", amount: "₹1,500", taxNote: "includes 18% GST" },
    ],
  },
];

const render = (props: Parameters<typeof PaymentsList>[0]): string => renderToStaticMarkup(createElement(PaymentsList, props)).replaceAll("<!-- -->", "");

describe("PaymentsList", () => {
  it("lists each payment as a row with its words, number, amount, status and a Receipt link", () => {
    const html = render({ months });
    expect(html).toContain(">Payments</h2>");
    expect(html).toContain("First payment, covering your first month");
    expect(html).toContain("FY/26-27/000001");
    expect(html).toContain("₹2,999");
    expect(html).toContain("Paid");
    expect(html).toContain("Receipt<span class=\"sr-only\"> for Tax invoice FY/26-27/000001</span>");
    expect(html).toContain("Download all");
  });

  it("keeps an extra still to pay as a row with its Pay button, and no table", () => {
    const html = render({ months });
    expect(html).toContain("Extra page: Gallery");
    expect(html).toContain("To pay");
    expect(html).toContain("Pay<span class=\"sr-only\"> for Extra page: Gallery</span>");
    expect(html).not.toContain("<table");
    expect(html).not.toContain("truncate");
  });

  it("says nothing is billed yet instead of drawing an empty list", () => {
    const html = render({ months: [], emptyBody: "Nothing yet." });
    expect(html).toContain("Nothing billed yet");
    expect(html).toContain("Nothing yet.");
    expect(html).not.toContain("Download all");
  });
});
