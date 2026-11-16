import type { Lead } from "@brandbasket/db";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { readEnquiryQuery } from "@/lib/enquiries";
import { EnquiryList } from "./enquiry-list";

const query = readEnquiryQuery({});
const lead = {
  id: "lead-1",
  businessName: "Green Leaf Cafe",
  name: "Asha",
  city: null,
  source: "contact",
  status: "new",
  plans: [],
  assignedStaffId: null,
  createdAt: new Date("2026-11-10T10:00:00Z"),
} as unknown as Lead;

function render(rows: readonly Lead[], selectedId: string | null): string {
  return renderToStaticMarkup(
    createElement(EnquiryList, { all: rows, rows, query, selectedId, ownerNames: new Map(), now: new Date("2026-11-12T10:00:00Z") }),
  );
}

describe("EnquiryList", () => {
  it("shows the shared empty state when there are no enquiries", () => {
    const html = render([], null);
    expect(html).toContain("No enquiries yet.");
    expect(html).toContain("border-dashed");
  });

  it("is the one focal card until an enquiry is open beside it", () => {
    expect(render([lead], null)).toContain("border-t-rattan");
    expect(render([lead], "lead-1")).not.toContain("border-t-rattan");
  });
});
