import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { storageStatePath } from "./accounts";
import { settle, unique } from "./support";

/*
 * The blog editor for a live website (Kulkarni), at 1440 and at 390: create a post, the allowance line, unsaved changes,
 * save, the post checklist, a cover image with its description, publish and unpublish, duplicate and delete. Every post
 * this file makes is deleted before the test ends, so the allowance line ends where it started. Publishing writes to the
 * local Payload database only.
 */

const COVER = resolve(__dirname, "../src/app/apple-icon.png");
// Long enough to pass the checklist's search description check.
const SUMMARY = "Simple stretches for a stiff back after a long day at the desk, with how long to hold each one and when to stop and call us.";

/** "3 of 100 posts used." as the number used. */
async function postsUsed(page: Page): Promise<number> {
  await page.goto("/website/blog");
  const line = page.getByText(/\d+ of \d+ posts used\./).first();
  await expect(line).toBeVisible();
  const match = /(\d+) of \d+ posts used/.exec(await line.innerText());
  return Number(match?.[1]);
}

async function moreAction(page: Page, item: string | RegExp): Promise<void> {
  await page.getByRole("button", { name: "More actions" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

async function deleteOpenPost(page: Page): Promise<void> {
  await moreAction(page, "Delete post");
  const confirm = page.getByRole("alertdialog", { name: "Delete this post?" });
  await expect(confirm).toBeVisible();
  await confirm.getByRole("button", { name: "Delete post" }).click();
  await page.waitForURL((url) => url.pathname === "/website/blog", { timeout: 60_000 });
}

const checklistScore = async (page: Page): Promise<number> => {
  const meta = page.locator("section", { has: page.getByRole("heading", { name: "Post checklist" }) }).getByText(/\d+ of 100/);
  return Number(/(\d+) of 100/.exec(await meta.innerText())?.[1]);
};

// The two sizes share Kulkarni's allowance line, so they run one after the other.
test.describe.configure({ mode: "serial" });

for (const size of [
  { name: "1440", viewport: { width: 1440, height: 900 } },
  { name: "390", viewport: { width: 390, height: 844 } },
]) {
  test.describe(`blog editor at ${size.name}`, () => {
    test.use({ storageState: storageStatePath("kulkarni"), viewport: size.viewport });

    test("create, save, cover with description, publish, duplicate, delete", async ({ page }) => {
      test.setTimeout(300_000);
      const before = await postsUsed(page);
      const title = `E2E post ${unique()}`;

      // New post: a title is all it takes, and the editor opens on a draft.
      await page.goto("/website/blog/new");
      await expect(page.getByRole("heading", { level: 1, name: "New post" })).toBeVisible();
      await page.getByLabel("Title").fill(title);
      await page.getByRole("button", { name: "Create post" }).click();
      await page.waitForURL(/\/website\/blog\/[^/]+$/, { timeout: 60_000 });
      await settle(page);
      const postUrl = page.url();
      await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
      await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible();
      await expect(page.getByRole("status").filter({ hasText: /^Saved / })).toBeVisible();

      try {
        // The allowance line counts the new draft.
        expect(await postsUsed(page)).toBe(before + 1);
        await page.goto(postUrl);
        await settle(page);

        // Unsaved changes: the status line says so and leaving the page asks first.
        const scoreBefore = await checklistScore(page);
        await page.getByRole("textbox", { name: "Summary" }).fill(SUMMARY);
        await page.getByRole("textbox", { name: /Text/ }).or(page.locator('[contenteditable="true"]')).first().click();
        await page.keyboard.type("Sit tall, breathe out and turn slowly to each side. Hold for ten seconds.");
        await expect(page.getByRole("status").filter({ hasText: "Unsaved changes" })).toBeVisible();
        let asked = false;
        page.once("dialog", (dialog) => {
          asked = dialog.type() === "beforeunload";
          void dialog.dismiss();
        });
        await page.reload({ timeout: 5_000 }).catch(() => undefined);
        expect(asked, "reloading with unsaved changes asks first").toBe(true);
        await expect(page.getByRole("textbox", { name: "Summary" })).toHaveValue(/Simple stretches/);

        // The checklist moves as the post improves.
        expect(await checklistScore(page)).toBeGreaterThan(scoreBefore);

        // Save draft keeps it a draft.
        await page.getByRole("button", { name: "Save draft" }).click();
        await expect(page.getByRole("status").filter({ hasText: /^Saved / })).toBeVisible({ timeout: 30_000 });
        await page.reload();
        await expect(page.getByRole("textbox", { name: "Summary" })).toHaveValue(/Simple stretches/);
        await expect(page.getByText(/Sit tall, breathe out/)).toBeVisible();

        // Cover image: types and size stated up front; after the upload a description field appears.
        await expect(page.getByText(/JPEG, PNG or WebP, up to/)).toBeVisible();
        await page.locator('input[type="file"]').first().setInputFiles(COVER);
        const alt = page.getByLabel("Cover image description");
        await expect(alt).toBeVisible({ timeout: 60_000 });
        await alt.fill("A physiotherapist guiding a seated back stretch");
        await page.getByRole("button", { name: "Save draft" }).click();
        await expect(page.getByRole("status").filter({ hasText: /^Saved / })).toBeVisible({ timeout: 30_000 });
        await page.reload();
        await expect(page.getByLabel("Cover image description")).toHaveValue("A physiotherapist guiding a seated back stretch");
        const checklist = page.locator("section", { has: page.getByRole("heading", { name: "Post checklist" }) });
        await expect(checklist.getByRole("listitem").filter({ hasText: "Cover image has alt text" })).toContainText("Done");

        // Publish, then Unpublish from More actions.
        await page.getByRole("button", { name: "Publish", exact: true }).click();
        await expect(page.getByText("Published", { exact: true }).first()).toBeVisible({ timeout: 30_000 });
        await expect(page.getByRole("button", { name: "Update", exact: true })).toBeVisible();
        await moreAction(page, "Unpublish");
        await expect(page.getByText("Draft", { exact: true }).first()).toBeVisible({ timeout: 30_000 });

        // Duplicate opens the copy; delete the copy.
        await moreAction(page, "Duplicate");
        await page.waitForURL((url) => url.href !== postUrl && /\/website\/blog\/[^/]+$/.test(url.pathname), { timeout: 60_000 });
        await expect(page.getByRole("heading", { level: 1 })).toContainText(title);
        await deleteOpenPost(page);
      } finally {
        // The post is still there unless the steps above already failed before it was made: wait for the page to say which.
        const answer = await page.goto(postUrl);
        if (answer?.status() === 200) {
          await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
          await deleteOpenPost(page);
        }
      }

      // Both posts are gone and the allowance line is back where it was.
      expect(await postsUsed(page)).toBe(before);
      await expect(page.getByText(title)).toBeHidden();
      const gone = await page.goto(postUrl);
      expect(gone?.status()).toBe(404);
    });

    test("an empty title cannot be saved and says why", async ({ page }) => {
      await page.goto("/website/blog/new");
      await page.getByRole("button", { name: "Create post" }).click();
      // The browser's own check stops the send: the title is required.
      await expect(page).toHaveURL(/\/website\/blog\/new$/);
      expect(await page.getByLabel("Title").evaluate((input) => (input as HTMLInputElement).validity.valueMissing)).toBe(true);
    });
  });
}

test.describe("blog editor for a viewer", () => {
  test.use({ storageState: storageStatePath("kulkarni-viewer") });

  test("a viewer cannot open New post", async ({ page }) => {
    await page.goto("/website/blog/new");
    await expect(page).not.toHaveURL(/\/website\/blog\/new$/);
  });
});
