import { render } from "@testing-library/react";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";
import { HelpCallsScreen } from "@/features/calls/components/help-screens";
import type { WebsiteCore } from "../loader";
import { PagesScreen } from "./pages-screen";

vi.mock("next/navigation", () => ({ usePathname: () => "/website/pages", useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/features/calls/actions", () => ({ cancelCallAction: vi.fn(), bookCallAction: vi.fn() }));

const NOW = new Date("2026-11-03T10:00:00.000Z");
const core: WebsiteCore = { project: null, domain: null, live: { hostname: "kulkarni.example", launchedAt: NOW } };
const PAGE = { businessId: "b", url: "https://kulkarni.example/menu", title: null, lastSeenAt: NOW, createdAt: NOW };

describe("table headers", () => {
  it("Pages renders one row of headers, with no row inside a row", () => {
    const { container } = render(<PagesScreen core={core} pages={{ ok: true, data: [PAGE] }} now={NOW} />);
    expect(container.querySelectorAll("thead tr")).toHaveLength(1);
    expect(container.querySelectorAll("tr tr")).toHaveLength(0);
  });

  it("Past calls renders one row of headers, with no row inside a row", () => {
    const row = {
      key: "c1",
      callId: "c1",
      about: "Website",
      reason: null,
      note: null,
      when: "Wed 2 Dec, 14:00",
      startsAtIso: "2026-10-01T10:00:00.000Z",
      endsAtIso: "2026-10-01T10:30:00.000Z",
      agreed: "New menu page",
      canChange: false,
      canCancel: false,
    };
    const { container } = render(<HelpCallsScreen calls={{ ok: true, data: { upcoming: [], past: [row], book: null } }} />);
    expect(container.querySelectorAll("thead tr")).toHaveLength(1);
    expect(container.querySelectorAll("tr tr")).toHaveLength(0);
  });

  it("no screen passes a TableRow into TableHead, which already makes the row", () => {
    const root = join(process.cwd(), "src/");
    const offenders: string[] = [];
    const walk = (dir: string): void => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (path.endsWith(".tsx") && /<TableHead>\s*<TableRow[\s>]/.test(readFileSync(path, "utf8"))) offenders.push(path.slice(root.length));
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
