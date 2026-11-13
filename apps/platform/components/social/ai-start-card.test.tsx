import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/app/app-host/(protected)/social/actions", () => ({ startSiteJobAction: vi.fn(), startNextMonthAction: vi.fn() }));

import { AiStartCard, StartDialog } from "@/components/social/ai-start-card";
import type { SiteJob } from "@/lib/social/ai";

const job = (over: Partial<SiteJob>): SiteJob => ({ id: "job_1", kind: "write", state: "running", step: 2, createdAt: "2026-11-11T10:00:00Z", ...over });
const html = (jobs: readonly SiteJob[]): string => renderToStaticMarkup(createElement(AiStartCard, { jobs, channels: [] }));

describe("the start from my website card", () => {
  it("invites the customer to start when nothing was written yet", () => {
    const out = html([]);
    expect(out).toContain("Let us write your posts from your website");
    expect(out).toContain("Start from my website");
    expect(out).not.toContain('role="status"');
  });

  it("shows where a batch is while it is being written, with no button to start another", () => {
    const out = html([job({ step: 1 })]);
    expect(out).toContain("We are writing your posts");
    expect(out).toContain("Reading your website");
    expect(out).toContain('role="status"');
    expect(out).not.toContain("Start from my website");
  });

  it("does not invite a start when the jobs could not be read", () => {
    const out = renderToStaticMarkup(createElement(AiStartCard, { jobs: [], channels: [], unavailable: true }));
    expect(out).toContain("We cannot check on your posts just now");
    expect(out).not.toContain("Start from my website");
  });

  it("tells the customer when posts were put away for waiting too long, with a way to see them", () => {
    const out = renderToStaticMarkup(createElement(AiStartCard, { jobs: [job({ state: "done" })], channels: [], expired: { batches: 1, pictures: 2 } }));
    expect(out).toContain("put away because nobody decided within 14 days");
    expect(out).toContain('href="/social/review"');
    expect(out).toContain('aria-label="Dismiss this notice"');
    expect(renderToStaticMarkup(createElement(AiStartCard, { jobs: [job({ state: "done" })], channels: [] }))).not.toContain("nobody decided");
  });

  it("says pictures, not posts, while a draw job is waiting or running", () => {
    expect(html([job({ kind: "draw", state: "queued", step: undefined })])).toContain("We are drawing your pictures");
    expect(html([job({ kind: "draw", state: "failed" })])).toContain("We could not draw your pictures");
  });

  it("does not repeat the full stop when a job is only waiting", () => {
    expect(html([job({ state: "queued", step: undefined })])).toContain("Waiting to start. You can leave this page");
  });

  it("says a failed batch failed, and offers to try again", () => {
    const out = html([job({ state: "failed" })]);
    expect(out).toContain("We could not write your posts");
    expect(out).toContain("Try again");
  });

  it("shows no card once the posts are written: looking them over is a button beside New post", () => {
    expect(html([job({ state: "done" })])).toBe("");
    expect(html([job({ kind: "draw", state: "done" })])).toBe("");
  });

  it("never uses a dash in its words", () => {
    for (const jobs of [[], [job({})], [job({ state: "failed" })], [job({ state: "done" })]]) expect(html(jobs)).not.toMatch(/[–—]/);
  });
});

describe("the window to start from a website", () => {
  const dialog = (connected: ReadonlySet<"instagram" | "facebook" | "linkedin" | "google">): string => renderToStaticMarkup(createElement(StartDialog, { connected, onClose: vi.fn() }));

  it("shows both ways posts can go out, with approving every post first chosen and posting automatically not available yet", () => {
    const out = dialog(new Set());
    expect(out).toContain("How should posts go out");
    expect(out).toContain("I approve every post first");
    expect(out).toContain("Post automatically");
    expect(out).toContain("Not available yet. We switch this on once you have approved a few posts yourself.");
    expect(out).toMatch(/<input[^>]*name="approval"[^>]*checked=""[^>]*value="manual"/);
    expect(out).toMatch(/<input[^>]*disabled=""[^>]*name="approval"[^>]*value="automatic"/);
    expect(out).not.toMatch(/[\u2013\u2014]/);
  });

  it("marks each chosen network with a green tick, not a black one", () => {
    const out = dialog(new Set(["facebook", "linkedin"]));
    expect(out.match(/rounded-full bg-ok text-white/g)).toHaveLength(2);
    expect(out).not.toContain("rounded-full bg-ink text-white");
    // The chosen options are light with a green outline, not filled black.
    expect(out).not.toMatch(/rounded-xl[^"]*bg-ink/);
    expect(out).toMatch(/rounded-xl bg-ok-wash[^"]*ring-ok/);
  });

  it("starts with the connected networks chosen, or all of them when none is connected yet", () => {
    expect((dialog(new Set(["facebook", "linkedin"])).match(/type="checkbox"[^>]*checked/g) ?? []).length).toBe(2);
    expect((dialog(new Set()).match(/type="checkbox"[^>]*checked/g) ?? []).length).toBe(4);
  });

  it("shows a locked website as text with no field, so the customer only presses start", () => {
    const out = renderToStaticMarkup(createElement(StartDialog, { connected: new Set<"instagram">(), website: "https://www.omsweets.in/", savedWebsite: "other.in", onClose: vi.fn() }));
    expect(out).toContain("Your website");
    expect(out).toContain("omsweets.in");
    expect(out).not.toContain('id="ai-start-address"');
    expect(out).not.toContain("www.omsweets");
  });

  it("fills in the website from setup when none is locked yet, and asks for a page link empty", () => {
    const out = renderToStaticMarkup(createElement(StartDialog, { connected: new Set<"instagram">(), savedWebsite: "omsweets.in", onClose: vi.fn() }));
    expect(out).toMatch(/id="ai-start-address"[^>]*value="omsweets.in"/);
    expect(renderToStaticMarkup(createElement(StartDialog, { connected: new Set<"instagram">(), onClose: vi.fn() }))).toMatch(/id="ai-start-address"[^>]*value=""/);
  });
});
