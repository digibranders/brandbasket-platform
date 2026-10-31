import type { ProjectStatus } from "@brandbasket/db";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { loadWebsiteBuild } from "@/lib/server/website-build";
import { WebsiteSection } from "./website-section";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/server/website-build", () => ({ loadWebsiteBuild: vi.fn() }));
vi.mock("@/app/(protected)/clients/[businessId]/website-actions", () => ({
  startBuildingAction: vi.fn(),
  putOnHoldAction: vi.fn(),
  resumeBuildingAction: vi.fn(),
  retakePreviewPictureAction: vi.fn(),
}));

const BUSINESS = "01a0f71b-8402-7d48-a90a-207e8c8a882c";
const LINK = "https://preview.example.com/site";

function project(status: ProjectStatus, extra: Record<string, unknown> = {}): never {
  return {
    id: "p-1",
    status,
    onboardingSubmittedAt: null,
    slaDueAt: null,
    previewUrl: null,
    previewSentAt: null,
    onHoldReason: null,
    launchedAt: null,
    ...extra,
  } as never;
}

async function render(notice: string | string[] | undefined = undefined): Promise<string> {
  return renderToStaticMarkup(await WebsiteSection({ businessId: BUSINESS, staffId: "staff-1", notice }));
}

function buttons(html: string): string[] {
  return [...html.matchAll(/<button[^>]*>([^<]*)<\/button>/g)].map((match) => match[1] ?? "");
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.mocked(loadWebsiteBuild).mockResolvedValue({ project: project("submitted"), picture: null });
});

describe("WebsiteSection buttons", () => {
  it.each([
    ["submitted", ["Start building", "Put on hold"]],
    ["building", ["Put on hold"]],
    ["revisions", ["Put on hold"]],
    ["preview", ["Put on hold"]],
    ["on_hold", ["Resume"]],
    ["onboarding", []],
    ["approved", []],
    ["live", []],
    ["cancelled", []],
  ] as const)("shows %s with the buttons %j", async (status, expected) => {
    vi.mocked(loadWebsiteBuild).mockResolvedValue({ project: project(status), picture: null });
    const html = await render();
    expect(html).toContain('id="website-build"');
    expect(html).toContain("Website build");
    expect(buttons(html)).toEqual(expected);
    expect(html.includes("Nothing to do here")).toBe(expected.length === 0);
  });

  it("gives every form the business id and the hold form its reason box and line", async () => {
    const html = await render();
    expect(html.match(new RegExp(`name="businessId" value="${BUSINESS}"`, "g"))).toHaveLength(2);
    expect(html).toContain("The customer reads this exactly as you type it.");
    expect(html).toContain('name="reason"');
    expect(html).toContain('maxLength="200"');
  });

  it("asks the loader for this business as this staff member", async () => {
    await render();
    expect(loadWebsiteBuild).toHaveBeenCalledWith(BUSINESS, "staff-1");
  });

  it("says there is no project when there is none", async () => {
    vi.mocked(loadWebsiteBuild).mockResolvedValue({ project: null, picture: null });
    const html = await render();
    expect(html).toContain("No project yet.");
    expect(buttons(html)).toEqual([]);
  });
});

describe("WebsiteSection facts", () => {
  it("shows the status in words and only the dates that exist, in India time", async () => {
    vi.mocked(loadWebsiteBuild).mockResolvedValue({
      project: project("preview", {
        onboardingSubmittedAt: new Date("2026-10-20T06:30:00Z"),
        slaDueAt: new Date("2026-10-22T06:30:00Z"),
        previewSentAt: new Date("2026-10-21T06:30:00Z"),
      }),
      picture: null,
    });
    const html = await render();
    expect(html).toContain("Awaiting client review");
    expect(html).toContain("Setup sent");
    expect(html).toContain("20 October 2026");
    expect(html).toContain("First preview due");
    expect(html).toContain("22 October 2026");
    expect(html).toContain("Preview sent");
    expect(html).toContain("21 October 2026");
    expect(html).not.toContain("Went live");
  });

  it("shows the pause reason as plain text, escaped", async () => {
    vi.mocked(loadWebsiteBuild).mockResolvedValue({ project: project("on_hold", { onHoldReason: "<img src=x onerror=alert(1)> logo" }), picture: null });
    const html = await render();
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; logo");
    expect(html).not.toContain("<img");
  });
});

describe("WebsiteSection picture", () => {
  const taken = new Date("2026-11-02T04:35:00Z");

  it("says nothing about a picture while there is no preview link", async () => {
    const html = await render();
    expect(html).not.toContain("Picture");
    expect(html).not.toContain("Take the picture again");
  });

  it("says the picture was not taken, and offers to take it, when there is none", async () => {
    vi.mocked(loadWebsiteBuild).mockResolvedValue({ project: project("preview", { previewUrl: LINK, previewSentAt: taken }), picture: null });
    const html = await render();
    expect(html).toContain("Picture not taken");
    expect(buttons(html)).toContain("Take the picture again");
  });

  it("says when it was taken, and hides the button, while it is current", async () => {
    vi.mocked(loadWebsiteBuild).mockResolvedValue({
      project: project("preview", { previewUrl: LINK, previewSentAt: new Date("2026-11-02T04:30:00Z") }),
      picture: { previewUrl: LINK, capturedAt: taken },
    });
    const html = await render();
    expect(html).toContain("Picture taken 2 Nov, 10:05");
    expect(buttons(html)).not.toContain("Take the picture again");
  });

  it("offers to take it again when the picture is older than the link or of another link", async () => {
    vi.mocked(loadWebsiteBuild).mockResolvedValue({
      project: project("preview", { previewUrl: LINK, previewSentAt: new Date("2026-11-03T04:30:00Z") }),
      picture: { previewUrl: LINK, capturedAt: taken },
    });
    expect(buttons(await render())).toContain("Take the picture again");
    vi.mocked(loadWebsiteBuild).mockResolvedValue({
      project: project("preview", { previewUrl: LINK, previewSentAt: new Date("2026-11-01T04:30:00Z") }),
      picture: { previewUrl: "https://old.example.com", capturedAt: taken },
    });
    const html = await render();
    expect(html).toContain("Picture not taken");
    expect(buttons(html)).toContain("Take the picture again");
  });

  it("offers it on a paused project too, since the link still exists", async () => {
    vi.mocked(loadWebsiteBuild).mockResolvedValue({ project: project("on_hold", { previewUrl: LINK }), picture: null });
    expect(buttons(await render())).toEqual(["Resume", "Take the picture again"]);
  });
});

describe("WebsiteSection notice", () => {
  it("shows the notice for what just happened, as ok or as a problem", async () => {
    expect(await render("paused")).toContain("Put on hold. The customer sees your reason.");
    expect(await render("not-allowed")).toContain("The project is not at a stage where that move works.");
    expect(await render("picture-taken")).toContain("Picture taken.");
  });

  it("shows no notice for nothing, an unknown value or a list", async () => {
    expect(await render()).not.toContain('role="status"');
    expect(await render("constructor")).not.toContain('role="status"');
    expect(await render(["paused"])).not.toContain('role="status"');
  });
});
