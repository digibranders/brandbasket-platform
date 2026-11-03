import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NuqsTestingAdapter, type UrlUpdateEvent } from "nuqs/adapters/testing";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import type { Loaded } from "@/lib/loaded";
import { expectNoAxeViolations } from "@/ui/test-axe";
import {
  BarList,
  DataTable,
  Delta,
  deltaTone,
  FilterBar,
  LineChart,
  MetricStrip,
  NextStep,
  PageHeader,
  PanelData,
  SaveBar,
  ServiceMark,
  sortRows,
  Sparkline,
  StatusBadge,
  Stepper,
  TimelineSteps,
} from "./index";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));

// Sample records for the tests only.
interface Enquiry {
  readonly id: string;
  readonly name: string;
  readonly received: Date;
}
const ENQUIRIES: readonly Enquiry[] = [
  { id: "e1", name: "Rohan Mehta", received: new Date("2026-11-02T05:00:00Z") },
  { id: "e2", name: "Priya Nair", received: new Date("2026-11-03T05:00:00Z") },
];

function withUrl(children: ReactNode, search = "", onUrlUpdate?: (event: UrlUpdateEvent) => void) {
  return (
    <NuqsTestingAdapter searchParams={search} {...(onUrlUpdate === undefined ? {} : { onUrlUpdate })}>
      {children}
    </NuqsTestingAdapter>
  );
}

describe("PageHeader", () => {
  it("renders one h1 with its meta line, actions and a back link", async () => {
    const { container } = render(<PageHeader title="Requests" description="2 waiting for you" actions={<button type="button">New request</button>} back={{ href: "/requests", label: "Requests" }} />);
    expect(screen.getByRole("heading", { level: 1, name: "Requests" })).toBeTruthy();
    expect(screen.getByText("2 waiting for you")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Requests" }).getAttribute("href")).toBe("/requests");
    await expectNoAxeViolations(container);
  });
});

describe("PanelData", () => {
  const ok: Loaded<readonly string[]> = { ok: true, data: ["Fixed your address"] };
  const empty: Loaded<readonly string[]> = { ok: true, data: [] };
  const failed: Loaded<readonly string[]> = { ok: false, error: { at: new Date("2026-11-24T06:12:00Z") } };
  const panel = (data: Loaded<readonly string[]>) => (
    <PanelData
      title="What we did"
      data={data}
      what="what we did"
      isEmpty={(lines) => lines.length === 0}
      empty={{ icon: "Tray", title: "Nothing yet", description: "Our work shows here as we do it." }}
      asOf={() => new Date("2026-11-23T06:00:00Z")}
    >
      {(lines) => <p>{lines[0]}</p>}
    </PanelData>
  );

  it("shows the data with when it was last updated", async () => {
    const { container } = render(panel(ok));
    expect(screen.getByText("Fixed your address")).toBeTruthy();
    expect(screen.getByText(/^Last updated Mon 23 Nov/)).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("shows the empty state, and the error state with the time to quote and Try again", () => {
    render(panel(empty));
    expect(screen.getByText("Nothing yet")).toBeTruthy();
    render(panel(failed));
    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("We could not load what we did.");
    expect(alert.textContent).toContain("Tue 24 Nov, 11:42");
    expect(within(alert).getByRole("button", { name: "Try again" })).toBeTruthy();
  });
});

describe("MetricStrip and Delta", () => {
  it("lists each number with its change and context", async () => {
    const { container } = render(
      <MetricStrip
        label="Last 30 days"
        metrics={[
          { label: "Enquiries", value: "38", change: { value: 9, significant: true }, period: "Last 30 days" },
          { label: "Visits", value: "1,204", change: { value: -3, unit: "percent" } },
        ]}
      />,
    );
    expect(screen.getByText("+9").className).toContain("text-pos-text");
    expect(screen.getByText("-3%").className).toContain("text-ink-3");
    expect(screen.getByText("Last 30 days", { selector: "dd" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("colours a change only when it is real, and knows which way is better", () => {
    expect(deltaTone({ value: 5 })).toBe("neutral");
    expect(deltaTone({ value: 5, significant: true })).toBe("pos");
    expect(deltaTone({ value: 5, better: "down", significant: true })).toBe("neg");
    expect(deltaTone({ value: -2, unit: "rank", better: "down", significant: true })).toBe("neg");
    render(<Delta value={3} unit="rank" significant />);
    expect(screen.getByText("↑3")).toBeTruthy();
  });
});

describe("DataTable", () => {
  const table = (onUrlUpdate?: (event: UrlUpdateEvent) => void, search = "") =>
    render(
      withUrl(
        <DataTable
          label="Enquiries"
          rows={ENQUIRIES}
          rowKey={(row) => row.id}
          columns={[
            { key: "name", header: "Name", cell: (row) => row.name, sortValue: (row) => row.name },
            { key: "received", header: "Received", cell: (row) => row.received.toISOString().slice(0, 10), sortValue: (row) => row.received, priority: "low" },
          ]}
          inspect={(row) => ({ title: row.name, body: <p>Details of {row.name}</p> })}
          empty={{ icon: "Tray", title: "No enquiries yet", description: "They show up here." }}
          count={(rows) => `${rows} enquiries`}
        />,
        search,
        onUrlUpdate,
      ),
    );

  it("sorts by a header and says so", async () => {
    table();
    await userEvent.click(screen.getByRole("button", { name: "Name" }));
    const names = screen.getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(names[0]).toContain("Priya Nair");
    expect(screen.getByRole("columnheader", { name: "Name" }).getAttribute("aria-sort")).toBe("ascending");
    expect(screen.getByText("2 enquiries")).toBeTruthy();
  });

  it("opens a row in the inspector through ?open=", async () => {
    const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>();
    table(onUrlUpdate);
    await userEvent.click(screen.getByRole("button", { name: "Rohan Mehta" }));
    expect(onUrlUpdate).toHaveBeenCalled();
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].queryString).toBe("?open=e1");
  });

  it("shows the record named in the URL", () => {
    table(undefined, "?open=e2");
    expect(screen.getByRole("dialog", { name: "Priya Nair" })).toBeTruthy();
  });

  it("shows the empty state instead of an empty table", () => {
    render(withUrl(<DataTable label="Enquiries" rows={[]} rowKey={() => ""} columns={[]} empty={{ icon: "Tray", title: "No enquiries yet", description: "They show up here." }} count={() => ""} />));
    expect(screen.queryByRole("table")).toBeNull();
    expect(screen.getByText("No enquiries yet")).toBeTruthy();
  });

  it("sorts stably", () => {
    expect(sortRows([{ n: 2, k: "a" }, { n: 1, k: "b" }, { n: 2, k: "c" }], (row) => row.n, "desc").map((row) => row.k)).toEqual(["a", "c", "b"]);
  });
});

describe("FilterBar", () => {
  it("keeps the chosen chip in the URL, and leaves the default out", async () => {
    const onUrlUpdate = vi.fn<(event: UrlUpdateEvent) => void>();
    const { container } = render(
      withUrl(
        <FilterBar
          label="Status"
          defaultValue="all"
          options={[
            { value: "all", label: "All" },
            { value: "new", label: "New", count: "4" },
          ]}
          search={{ label: "Search enquiries" }}
        />,
        "",
        onUrlUpdate,
      ),
    );
    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    expect(onUrlUpdate.mock.calls.at(-1)?.[0].queryString).toBe("?filter=new");
    expect(screen.getByRole("searchbox", { name: "Search enquiries" })).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});

describe("NextStep, Stepper and TimelineSteps", () => {
  it("says what happens next and holds its action", async () => {
    const { container } = render(
      <NextStep icon="Receipt" actions={<button type="button">Accept and pay</button>} note="₹1,500 includes 18% GST">
        A new page needs your OK first.
      </NextStep>,
    );
    expect(screen.getByRole("heading", { name: "Waiting for you" })).toBeTruthy();
    expect(screen.getByText("₹1,500 includes 18% GST")).toBeTruthy();
    await expectNoAxeViolations(container);
  });

  it("marks the current step for screen readers", async () => {
    const { container } = render(
      <>
        <Stepper
          label="Request progress"
          steps={[
            { label: "Sent", date: "Mon 2 Nov", state: "done" },
            { label: "In progress", state: "now" },
            { label: "Done", state: "todo" },
          ]}
        />
        <TimelineSteps label="What happens next" steps={[{ title: "We build it", meta: "By Fri 6 Nov", state: "now" }, { title: "You check it", state: "todo" }]} />
      </>,
    );
    const current = container.querySelectorAll("[aria-current='step']");
    expect(current).toHaveLength(2);
    expect(current[0]?.textContent).toContain("In progress");
    expect(screen.getByText(", done")).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});

describe("StatusBadge and ServiceMark", () => {
  it("uses the glossary's word and tone", () => {
    render(
      <>
        <StatusBadge kind="request" status="ready_to_check" />
        <StatusBadge kind="invoice" status="failed" />
        <StatusBadge kind="service" status="ending" endsOn={new Date("2026-12-01T06:00:00Z")} />
      </>,
    );
    expect(screen.getByText("Ready to check").className).toContain("bg-accent-wash");
    expect(screen.getByText("Failed").className).toContain("bg-neg-wash");
    expect(screen.getByText("Ending Tue 1 Dec")).toBeTruthy();
  });

  it("outlines the mark of a service not bought", () => {
    const { container } = render(<ServiceMark service="social" bought={false} />);
    expect(container.firstElementChild?.className).toContain("border-svc-social");
  });
});

describe("SaveBar", () => {
  it("shows from the first edit, discards and submits its form", async () => {
    const onDiscard = vi.fn();
    const { rerender } = render(<SaveBar dirty={false} formId="business" onDiscard={onDiscard} />);
    expect(screen.queryByRole("region", { name: "Unsaved changes" })).toBeNull();
    rerender(<SaveBar dirty formId="business" onDiscard={onDiscard} />);
    await userEvent.click(screen.getByRole("button", { name: "Discard" }));
    expect(onDiscard).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Save changes" }).getAttribute("form")).toBe("business");
  });
});

describe("charts", () => {
  it("draws a line chart with a text alternative and shows a point's values on hover", async () => {
    const { container } = render(
      <LineChart label="Visits by day" labels={["1 Nov", "2 Nov", "3 Nov"]} current={{ name: "This month", values: [4, 9, 6] }} previous={{ name: "Last month", values: [3, 5, 7] }} />,
    );
    expect(screen.getByRole("img", { name: "Visits by day" })).toBeTruthy();
    expect(screen.getByRole("table", { name: "Visits by day" }).querySelectorAll("tbody tr")).toHaveLength(3);
    const area = container.querySelector("rect");
    const svg = container.querySelector("svg");
    if (area === null || svg === null) throw new Error("chart not drawn");
    vi.spyOn(svg, "getBoundingClientRect").mockReturnValue({ left: 0, width: 640, top: 0, height: 220, right: 640, bottom: 220, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerMove(area, { clientX: 630 });
    expect(container.textContent).toContain("This month: 6");
    await expectNoAxeViolations(container);
  });

  it("refuses series that do not match the labels", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => render(<LineChart label="Visits" labels={["1 Nov"]} current={{ name: "This month", values: [1, 2] }} />)).toThrow(RangeError);
  });

  it("draws a sparkline, and a bar list with each number as text", async () => {
    const { container } = render(
      <>
        <Sparkline values={[1, 3, 2]} label="Enquiries rising" />
        <BarList label="Visits by source" items={[{ label: "Google search", value: 120 }, { label: "Direct", value: 60 }]} />
      </>,
    );
    expect(screen.getByRole("img", { name: "Enquiries rising" })).toBeTruthy();
    const bars = within(screen.getByRole("list", { name: "Visits by source" })).getAllByRole("listitem");
    expect(bars[1]?.textContent).toContain("60");
    expect(bars[1]?.querySelector("[style]")?.getAttribute("style")).toContain("width: 50%");
    await expectNoAxeViolations(container);
  });
});
