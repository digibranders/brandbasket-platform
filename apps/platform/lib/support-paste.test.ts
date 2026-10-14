import { describe, expect, it, vi } from "vitest";
import { handleImagePaste, pastedImageFiles, type PasteEventLike, type PastedItem } from "./support-paste";

const NOW = new Date("2026-10-10T14:25:30Z");

function imageItem(name: string, type = "image/png"): PastedItem {
  return { kind: "file", type, getAsFile: () => new File(["x"], name, { type }) };
}
const textItem: PastedItem = { kind: "string", type: "text/plain", getAsFile: () => null };

function pasteEvent(items: PastedItem[], defaultPrevented = false): PasteEventLike & { prevented: number } {
  const event = {
    defaultPrevented,
    clipboardData: { items },
    prevented: 0,
    preventDefault() {
      event.prevented += 1;
      (event as { defaultPrevented: boolean }).defaultPrevented = true;
    },
  };
  return event;
}

describe("pastedImageFiles", () => {
  it("keeps only images and names a generic one from the time", () => {
    const files = pastedImageFiles([textItem, imageItem("image.png"), imageItem("blob", "image/jpeg"), imageItem("receipt.webp", "image/webp")], NOW, "screenshot");
    expect(files.map((file) => file.name)).toEqual(["screenshot-142530.png", "screenshot-142530.jpg", "receipt.webp"]);
    expect(files.map((file) => file.type)).toEqual(["image/png", "image/jpeg", "image/webp"]);
  });

  it("returns nothing for text or an empty clipboard", () => {
    expect(pastedImageFiles([textItem], NOW, "screenshot")).toEqual([]);
    expect(pastedImageFiles(null, NOW, "screenshot")).toEqual([]);
    expect(pastedImageFiles([], NOW, "screenshot")).toEqual([]);
  });
});

describe("handleImagePaste", () => {
  it("adds the pasted images once and stops the browser pasting them as text", () => {
    const addFiles = vi.fn();
    const event = pasteEvent([imageItem("image.png")]);
    expect(handleImagePaste(event, addFiles, "reply-screenshot", NOW)).toBe(true);
    expect(addFiles).toHaveBeenCalledTimes(1);
    expect(addFiles.mock.calls[0]?.[0]?.[0]?.name).toBe("reply-screenshot-142530.png");
    expect(event.prevented).toBe(1);
  });

  it("uploads once when the same paste reaches two handlers, such as a text box and its form", () => {
    const addFiles = vi.fn();
    const event = pasteEvent([imageItem("image.png")]);
    handleImagePaste(event, addFiles, "screenshot", NOW);
    handleImagePaste(event, addFiles, "screenshot", NOW);
    expect(addFiles).toHaveBeenCalledTimes(1);
  });

  it("leaves a text paste alone", () => {
    const addFiles = vi.fn();
    const event = pasteEvent([textItem]);
    expect(handleImagePaste(event, addFiles, "screenshot", NOW)).toBe(false);
    expect(addFiles).not.toHaveBeenCalled();
    expect(event.prevented).toBe(0);
  });
});
