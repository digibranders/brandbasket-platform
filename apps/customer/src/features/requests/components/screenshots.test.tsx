import { act, render, screen, waitFor } from "@testing-library/react";
import { createRef } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Screenshots, type ScreenshotsHandle } from "./screenshots";

afterEach(() => vi.unstubAllGlobals());

describe("Screenshots", () => {
  it("uploads files handed over by a paste and shows each as a thumbnail with a remove button", async () => {
    const id = "6f1d2c3b-4a5e-4f60-8a7b-9c0d1e2f3a4b";
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify({ attachments: [{ id }] }), { status: 200 })));
    vi.stubGlobal("URL", Object.assign(URL, { createObjectURL: () => "blob:preview", revokeObjectURL: () => undefined }));
    const onIds = vi.fn();
    const handle = createRef<ScreenshotsHandle>();
    render(<Screenshots ref={handle} onIds={onIds} onBusy={() => undefined} />);

    await act(async () => handle.current?.addFiles([new File(["png"], "screenshot-142530.png", { type: "image/png" })]));

    await waitFor(() => expect(onIds).toHaveBeenLastCalledWith([id]));
    expect(screen.getByAltText("screenshot-142530.png")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Remove screenshot-142530.png" })).toBeTruthy();
  });
});
