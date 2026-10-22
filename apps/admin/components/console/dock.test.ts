import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { centerActiveItem, Dock } from "./dock";

const pathname = vi.hoisted(() => ({ current: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => pathname.current }));

function render(path: string, needsYou = false, role: "support" | "finance" | "admin" = "admin", directory = true): string {
  pathname.current = path;
  return renderToStaticMarkup(createElement(Dock, { needsYou, role, directory }));
}

beforeEach(() => {
  pathname.current = "/";
});

describe("the console dock", () => {
  it("links the 15 sections and Add lead", () => {
    const html = render("/clients");
    expect(html.match(/<a /g)).toHaveLength(16);
    expect(html).toContain('href="/ad-credit"');
    expect(html).toContain('href="/invoices"');
    expect(html).toContain('href="/leads/new"');
  });

  it("leaves out the directory's sections where the deployment has no directory (Brandbasket), and keeps the rest", () => {
    const html = render("/clients", false, "admin", false);
    for (const href of ["/directory", "/geography", "/ads", "/deals"]) expect(html).not.toContain(`href="${href}"`);
    for (const href of ["/", "/leads", "/clients", "/coupons", "/affiliates", "/pricing", "/invoices", "/leaving", "/outbox", "/access-log", "/leads/new"]) {
      expect(html).toContain(`href="${href}"`);
    }
  });

  it("shows support staff only what their role can open: no Pricing, Invoices or Access log", () => {
    const html = render("/clients", false, "support");
    expect(html.match(/<a /g)).toHaveLength(13);
    for (const href of ["/pricing", "/invoices", "/access-log"]) expect(html).not.toContain(`href="${href}"`);
    expect(html).toContain('href="/leads"');
    expect(html).toContain('href="/ad-credit"');
  });

  it("shows finance staff the money pages but not the access log", () => {
    const html = render("/clients", false, "finance");
    expect(html.match(/<a /g)).toHaveLength(15);
    expect(html).toContain('href="/pricing"');
    expect(html).toContain('href="/invoices"');
    expect(html).not.toContain('href="/access-log"');
  });

  it("scrolls sideways inside the screen instead of running off it", () => {
    const nav = render("/").match(/<nav[^>]*>/)?.[0] ?? "";
    expect(nav).toContain("max-w-[calc(100vw-1.5rem)]");
    expect(nav).toContain("overflow-x-auto");
    expect(nav).toContain("overscroll-x-contain");
    expect(nav).toContain("[scrollbar-width:none]");
  });

  it("never shrinks an item below a tap target, on a phone", () => {
    const links = render("/").match(/<a [^>]*>/g) ?? [];
    expect(links).toHaveLength(16);
    for (const link of links) {
      expect(link).toContain("shrink-0");
      expect(link).toContain("min-w-[3.75rem]");
    }
  });

  it("fits every item and Add lead in Brandbasket's bar at 1024px, by narrowing them from md until xl", () => {
    // 1024px less the bar's 1.5rem of margin is 1000px. Each section is 4rem wide with a 4px gap, plus the divider and the
    // bar's padding; at 4.5rem each the bar of the directory brands came to 1081px and pushed the gold Add lead out of
    // sight. Brandbasket has no directory, so its bar is the shorter one. The longer bar scrolls sideways instead.
    const links = render("/", false, "admin", false).match(/<a [^>]*>/g) ?? [];
    expect(links).toHaveLength(12);
    for (const link of links) {
      expect(link).toContain("md:w-16");
      expect(link).toContain("xl:w-[4.5rem]");
      expect(link).not.toMatch(/(^|\s)md:w-\[4\.5rem\]/);
    }
    const sections = links.length - 1;
    const bar = sections * 64 + 5 + 12 + sections * 4;
    expect(bar).toBeLessThanOrEqual(1024 - 24);
  });

  it("marks only the current section, and keeps sub-pages under their section", () => {
    const html = render("/invoices/export");
    const current = html.match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/invoices"');
  });

  it("marks Add lead, and not Leads, on the new lead page", () => {
    const current = render("/leads/new").match(/<a [^>]*aria-current="page"[^>]*>/g) ?? [];
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/leads/new"');
  });

  it("says something needs you on Journey only when it does", () => {
    expect(render("/", true)).toContain(", something needs you");
    expect(render("/", false)).not.toContain("something needs you");
  });
});

describe("centerActiveItem", () => {
  it("centres the current item sideways, without the smooth animation that ignores reduced motion", () => {
    const scrollIntoView = vi.fn();
    const querySelector = vi.fn().mockReturnValue({ scrollIntoView });
    centerActiveItem({ querySelector });
    expect(querySelector).toHaveBeenCalledWith('[aria-current="page"]');
    expect(scrollIntoView).toHaveBeenCalledWith({ behavior: "auto", inline: "center", block: "nearest" });
  });

  it("does nothing when no item is current or the bar is not mounted", () => {
    expect(() => centerActiveItem({ querySelector: () => null })).not.toThrow();
    expect(() => centerActiveItem(null)).not.toThrow();
  });
});
