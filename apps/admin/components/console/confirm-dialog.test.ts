import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ConfirmDialog } from "./confirm-dialog";

describe("ConfirmDialog", () => {
  it("renders trigger button and accessible dialog with title and consequence", () => {
    const dummyAction = vi.fn();
    const html = renderToStaticMarkup(
      createElement(
        ConfirmDialog,
        {
          title: "Cancel website build",
          consequence: "The build will be cancelled. Their plan and billing do not change.",
          triggerLabel: "Cancel this build",
          confirmLabel: "Cancel build",
          cancelLabel: "Keep build",
          variant: "danger",
          formAction: dummyAction,
        },
        createElement("input", { type: "hidden", name: "businessId", value: "b1" }),
      ),
    );

    // Trigger button
    expect(html).toContain("Cancel this build");

    // Dialog structure and accessibility
    expect(html).toContain("<dialog");
    expect(html).toContain("Cancel website build");
    expect(html).toContain("The build will be cancelled. Their plan and billing do not change.");
    expect(html).toContain("Cancel build");
    expect(html).toContain("Keep build");

    // Hidden confirm input and children
    expect(html).toContain('name="confirm"');
    expect(html).toContain('value="yes"');
    expect(html).toContain('name="businessId"');
    expect(html).toContain('value="b1"');
  });

  it("supports default variant with primary button style", () => {
    const html = renderToStaticMarkup(
      createElement(ConfirmDialog, {
        title: "Add a round of changes",
        consequence: "This grants the client one extra round of revisions without charging them.",
        triggerLabel: "Add round",
        confirmLabel: "Add round",
        variant: "default",
      }),
    );

    expect(html).toContain("Add a round of changes");
    expect(html).toContain("Add round");
    expect(html).toContain("bg-ink");
  });
});
