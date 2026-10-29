import { describe, expect, it } from "vitest";
import { readAskDefaults } from "./form";

const OFFERED = [{ value: "website_update" }, { value: "question" }, { value: "billing" }] as const;

describe("readAskDefaults", () => {
  it("starts on the intent the link names when this customer may pick it", () => {
    expect(readAskDefaults({ intent: "billing" }, OFFERED).intent).toBe("billing");
  });

  it("lands an older ?kind= link on the intent that means the same", () => {
    expect(readAskDefaults({ kind: "website" }, OFFERED).intent).toBe("website_update");
    expect(readAskDefaults({ kind: "billing" }, OFFERED).intent).toBe("billing");
    expect(readAskDefaults({ kind: "other" }, OFFERED).intent).toBe("question");
  });

  it("ignores an intent the customer cannot pick, an unknown one, or a repeated one", () => {
    expect(readAskDefaults({ kind: "social" }, OFFERED).intent).toBeNull();
    expect(readAskDefaults({ intent: "social_request" }, OFFERED).intent).toBeNull();
    expect(readAskDefaults({ kind: "nonsense" }, OFFERED).intent).toBeNull();
    expect(readAskDefaults({ kind: ["website", "billing"] }, OFFERED).intent).toBeNull();
    expect(readAskDefaults({}, OFFERED).intent).toBeNull();
  });

  it("fills the page as written, and cuts it to the form's 200 characters", () => {
    expect(readAskDefaults({ page: "Home & About" }, OFFERED).page).toBe("Home & About");
    expect(readAskDefaults({ page: "a".repeat(250) }, OFFERED).page).toBe("a".repeat(200));
  });

  it("leaves the page empty when it is missing or repeated", () => {
    expect(readAskDefaults({}, OFFERED).page).toBe("");
    expect(readAskDefaults({ page: ["Home", "About"] }, OFFERED).page).toBe("");
  });

  it("shows the preview line only when the customer came from the preview", () => {
    expect(readAskDefaults({ from: "preview" }, OFFERED).fromPreview).toBe(true);
    expect(readAskDefaults({ from: "elsewhere" }, OFFERED).fromPreview).toBe(false);
    expect(readAskDefaults({}, OFFERED).fromPreview).toBe(false);
  });
});
