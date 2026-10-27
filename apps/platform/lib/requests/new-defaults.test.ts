import { describe, expect, it } from "vitest";
import { readAskDefaults } from "./form";

const OFFERED = [
  { value: "website", label: "Website" },
  { value: "billing", label: "Billing" },
  { value: "other", label: "Something else" },
] as const;

describe("readAskDefaults", () => {
  it("starts on the kind the link names when this customer may pick it", () => {
    expect(readAskDefaults({ kind: "billing" }, OFFERED).kind).toBe("billing");
  });

  it("ignores a kind the customer cannot pick, an unknown one, or a repeated one", () => {
    expect(readAskDefaults({ kind: "social" }, OFFERED).kind).toBeNull();
    expect(readAskDefaults({ kind: "nonsense" }, OFFERED).kind).toBeNull();
    expect(readAskDefaults({ kind: ["website", "billing"] }, OFFERED).kind).toBeNull();
    expect(readAskDefaults({}, OFFERED).kind).toBeNull();
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
