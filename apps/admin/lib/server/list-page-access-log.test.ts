import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

/**
 * Every list page here reads customer data, so each must record the view through `logStaffAccess` (DPDP Rules 2025
 * r.6(1)(c)). Reads the page source rather than running it, so a future page that forgets the call fails this test.
 */
const LIST_PAGES: readonly { readonly file: string; readonly action: string }[] = [
  { file: "page.tsx", action: "today.view" },
  { file: "clients/page.tsx", action: "clients.list" },
  { file: "leads/page.tsx", action: "leads.list" },
  { file: "calls/page.tsx", action: "calls.list" },
  { file: "projects/page.tsx", action: "projects.list" },
  { file: "leaving/page.tsx", action: "leaving.list" },
  { file: "support/page.tsx", action: "support.list" },
  { file: "support/new/page.tsx", action: "support.new" },
  { file: "outbox/page.tsx", action: "outbox.list" },
  { file: "ad-credit/page.tsx", action: "ad_credit.list" },
  { file: "affiliates/page.tsx", action: "affiliates.list" },
  { file: "affiliates/[affiliateId]/page.tsx", action: "affiliates.detail" },
  { file: "affiliates/[affiliateId]/codes/new/page.tsx", action: "affiliates.new_code" },
  { file: "coupons/page.tsx", action: "coupons.list" },
  { file: "coupons/[codeId]/page.tsx", action: "coupons.detail" },
];

describe("list pages record staff access", () => {
  it.each(LIST_PAGES)("$file calls logStaffAccess with $action", ({ file, action }) => {
    const source = readFileSync(fileURLToPath(new URL(`../../app/(protected)/${file}`, import.meta.url)), "utf8");
    expect(source).toMatch(/await logStaffAccess\(/);
    expect(source).toContain(`action: "${action}"`);
  });
});
