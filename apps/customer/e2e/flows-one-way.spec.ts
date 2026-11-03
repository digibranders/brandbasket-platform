import { expect, test } from "@playwright/test";
import { storageStatePath } from "./accounts";
import { payOnTestCheckout, settle } from "./support";

/*
 * The two key flows that cannot be undone on the seed: approving Patel's preview and reactivating Reddy's lapsed plan.
 * By default each walks to its last step and backs out (Keep reviewing, Cancel on the test checkout), so the seed keeps
 * its states for the sweep. With E2E_ONE_WAY=1 they finish; run that last, then re-seed a fresh database
 * (`pnpm --filter @brandbasket/db db:seed:v4` does not undo them) before the next sweep.
 */

const FINISH = process.env.E2E_ONE_WAY === "1";

test.describe("approve preview (Patel)", () => {
  test.use({ storageState: storageStatePath("patel") });

  test("approve preview", async ({ page }) => {
    await page.goto("/website");
    await expect(page.getByRole("link", { name: /Open preview/ }).first()).toBeVisible();
    await page.getByRole("button", { name: "Approve and go live" }).click();
    await expect(page.getByText("Approve this preview? We will then start getting it live.")).toBeFocused();
    if (!FINISH) {
      await page.getByRole("button", { name: "Keep reviewing" }).click();
      await expect(page.getByRole("button", { name: "Approve and go live" })).toBeVisible();
      return;
    }
    await page.getByRole("button", { name: "Yes, approve" }).click();
    await expect(page.getByRole("button", { name: "Approve and go live" })).toBeHidden({ timeout: 30_000 });
    await page.goto("/");
    await expect(page.getByText(/Approved|getting it live/i).first()).toBeVisible();
  });
});

test.describe("lapsed to reactivated (Reddy)", () => {
  test.use({ storageState: storageStatePath("reddy") });

  test("lapsed to reactivated", async ({ page }) => {
    // Lapsed: a banner on every page and a task on Home (plan 60, section 13).
    await page.goto("/");
    await expect(page.getByText(/plan has ended|Reactivate/i).first()).toBeVisible();
    await page.goto("/billing");
    const reactivate = page.getByRole("button", { name: /^Reactivate for / });
    await expect(reactivate).toBeVisible();
    await reactivate.click();
    await expect(page.getByRole("heading", { name: "Test payment" })).toBeVisible({ timeout: 60_000 });
    if (!FINISH) {
      await page.getByRole("link", { name: "Cancel" }).click();
      await settle(page);
      await page.goto("/billing");
      await expect(page.getByRole("button", { name: /^Reactivate for / })).toBeVisible();
      return;
    }
    await payOnTestCheckout(page);
    await page.goto("/billing");
    await expect(page.getByRole("button", { name: /^Reactivate for / })).toBeHidden();
  });
});
