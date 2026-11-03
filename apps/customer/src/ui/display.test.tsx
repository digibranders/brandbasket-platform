import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { Avatar, initialsOf } from "./avatar";
import { Badge } from "./badge";
import { Banner } from "./banner";
import { Button } from "./button";
import { Chips, Segmented } from "./chips";
import { EmptyState } from "./empty-state";
import { FileDrop } from "./file-drop";
import { Icon } from "./icon";
import { Kbd } from "./kbd";
import { Meter } from "./meter";
import { Pagination } from "./pagination";
import { ServiceTag } from "./service-tag";
import { Skeleton } from "./skeleton";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "./table";
import { TabLinks, TabPanel, Tabs } from "./tabs";
import { expectNoAxeViolations } from "./test-axe";

describe("Icon", () => {
  it("is hidden from screen readers without a label and named with one", () => {
    const { container } = render(
      <>
        <Icon name="House" />
        <Icon name="Warning" label="Needs you" />
      </>,
    );
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("img", { name: "Needs you" })).toBeTruthy();
  });
});

describe("Badge, ServiceTag, Kbd, Skeleton", () => {
  it("always carries a word", async () => {
    const { container } = render(
      <div>
        <Badge tone="warn" icon="Warning">
          Waiting for you
        </Badge>
        <ServiceTag service="search" />
        <Kbd>⌘K</Kbd>
        <Skeleton className="w-24" />
      </div>,
    );
    expect(screen.getByText("Waiting for you")).toBeTruthy();
    expect(screen.getByText("Local SEO + AEO")).toBeTruthy();
    expect(container.querySelector("kbd")?.textContent).toBe("⌘K");
    expect(container.querySelector("[aria-hidden].motion-pulse")).toBeTruthy();
    await expectNoAxeViolations(container);
  });
});

describe("Avatar", () => {
  it("is named by the name and shows its initials", () => {
    render(<Avatar name="Apex Diagnostics" kind="business" />);
    expect(screen.getByRole("img", { name: "Apex Diagnostics" }).textContent).toBe("AD");
  });

  it("takes up to two initials", () => {
    expect(initialsOf("  anand  kumar verma ")).toBe("AK");
    expect(initialsOf("Riya")).toBe("R");
  });
});

describe("Banner", () => {
  it("announces an error at once and a notice politely, with one action", async () => {
    const onRetry = vi.fn();
    const { container } = render(
      <>
        <Banner tone="neg" action={<Button size="sm" onClick={onRetry}>Try again</Button>}>
          We could not load this page. Your data is safe.
        </Banner>
        <Banner tone="info">Your preview is ready.</Banner>
      </>,
    );
    expect(screen.getByRole("alert").textContent).toContain("We could not load this page.");
    expect(screen.getByRole("status").textContent).toContain("Your preview is ready.");
    await userEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await expectNoAxeViolations(container);
  });
});

describe("EmptyState", () => {
  it("says why it is empty, what will appear and offers one action", () => {
    render(<EmptyState icon="Tray" title="No enquiries yet" description="They show up here." action={<Button>Copy link</Button>} />);
    expect(screen.getByRole("heading", { name: "No enquiries yet" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Copy link" })).toBeTruthy();
  });
});

describe("Meter", () => {
  it("is a meter with its label and both numbers", () => {
    render(<Meter label="Small edits included this month" value={3} max={5} valueText="3 of 5" />);
    const meter = screen.getByRole("meter", { name: "Small edits included this month" });
    expect(meter.getAttribute("aria-valuenow")).toBe("3");
    expect(meter.getAttribute("aria-valuetext")).toBe("3 of 5");
  });
});

describe("Chips and Segmented", () => {
  const options = [
    { value: "all", label: "All", count: "12" },
    { value: "new", label: "New", count: "4" },
  ];

  it("presses one chip at a time and keeps one pressed", async () => {
    const onValueChange = vi.fn();
    const { container } = render(<Chips aria-label="Filter enquiries" options={options} value="all" onValueChange={onValueChange} />);
    expect(screen.getByRole("group", { name: "Filter enquiries" })).toBeTruthy();
    await userEvent.click(screen.getByRole("button", { name: /New/ }));
    expect(onValueChange).toHaveBeenCalledWith("new");
    await userEvent.click(screen.getByRole("button", { name: /All/ }));
    expect(onValueChange).toHaveBeenCalledTimes(1);
    expect(screen.getByRole("button", { name: /All/ }).getAttribute("aria-pressed")).toBe("true");
    await expectNoAxeViolations(container);
  });

  it("switches views with the arrow keys", async () => {
    const onValueChange = vi.fn();
    render(
      <Segmented aria-label="View" options={[{ value: "month", label: "Month" }, { value: "list", label: "List" }]} value="month" onValueChange={onValueChange} />,
    );
    screen.getByRole("button", { name: "Month" }).focus();
    await userEvent.keyboard("{ArrowRight}");
    expect(document.activeElement).toBe(screen.getByRole("button", { name: "List" }));
    await userEvent.keyboard("{Enter}");
    expect(onValueChange).toHaveBeenCalledWith("list");
  });
});

describe("TabLinks and Tabs", () => {
  it("marks the current page's tab", async () => {
    const { container } = render(
      <TabLinks
        aria-label="Plan & billing"
        current="/billing/invoices"
        items={[
          { href: "/billing", label: "Services" },
          { href: "/billing/invoices", label: "Invoices", count: "3" },
        ]}
      />,
    );
    expect(screen.getByRole("link", { name: /Invoices/ }).getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: "Services" }).getAttribute("aria-current")).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("switches panels in place with the arrow keys", async () => {
    render(
      <Tabs aria-label="Enquiry" items={[{ value: "details", label: "Details" }, { value: "chat", label: "Conversation" }]}>
        <TabPanel value="details">Phone and email</TabPanel>
        <TabPanel value="chat">The chat</TabPanel>
      </Tabs>,
    );
    expect(screen.getByRole("tabpanel").textContent).toBe("Phone and email");
    screen.getByRole("tab", { name: "Details" }).focus();
    await userEvent.keyboard("{ArrowRight}{Enter}");
    expect(screen.getByRole("tab", { name: "Conversation" }).getAttribute("aria-selected")).toBe("true");
  });
});

describe("Table and Pagination", () => {
  it("is a real table with column headers and a footer", async () => {
    const { container } = render(
      <>
        <Table>
          <TableHead>
            <TableHeader>Name</TableHeader>
            <TableHeader hideOnPhone>Source</TableHeader>
            <TableHeader align="end">Received</TableHeader>
          </TableHead>
          <TableBody>
            <TableRow selected>
              <TableCell>Rohan Mehta</TableCell>
              <TableCell hideOnPhone>Website chat</TableCell>
              <TableCell align="end">Today, 10:42</TableCell>
            </TableRow>
          </TableBody>
        </Table>
        <TableFooter>
          1 enquiry
          <Pagination page={1} pageCount={3} hrefFor={(page) => `/enquiries?page=${page}`} status="Page 1 of 3" previousLabel="Previous page" nextLabel="Next page" />
        </TableFooter>
      </>,
    );
    expect(screen.getAllByRole("columnheader").map((cell) => cell.textContent)).toEqual(["Name", "Source", "Received"]);
    expect(screen.getByRole("row", { name: /Rohan Mehta/ }).getAttribute("aria-selected")).toBe("true");
    expect(screen.getByRole("link", { name: "Next page" }).getAttribute("href")).toBe("/enquiries?page=2");
    expect(screen.queryByRole("link", { name: "Previous page" })).toBeNull();
    await expectNoAxeViolations(container);
  });

  it("shows nothing for a single page", () => {
    const { container } = render(<Pagination page={1} pageCount={1} hrefFor={String} status="Page 1 of 1" previousLabel="Previous" nextLabel="Next" />);
    expect(container.innerHTML).toBe("");
  });
});

describe("FileDrop", () => {
  it("hands chosen files over and shows each file's progress and error", async () => {
    const onFiles = vi.fn();
    const { container } = render(
      <FileDrop
        chooseLabel="Choose photos"
        description="JPG or PNG, up to 4 MB each"
        accept="image/jpeg,image/png"
        multiple
        onFiles={onFiles}
        files={[
          { id: "1", name: "front.jpg", size: "1.2 MB", progress: 40 },
          { id: "2", name: "menu.pdf", size: "6 MB", error: "Only JPG or PNG." },
        ]}
      />,
    );
    const button = screen.getByRole("button", { name: "Choose photos" });
    expect(button.getAttribute("aria-describedby")).toBeTruthy();
    const input = container.querySelector<HTMLInputElement>("input[type=file]");
    if (input === null) throw new Error("no file input");
    const photo = new File(["x"], "front.jpg", { type: "image/jpeg" });
    await userEvent.upload(input, photo);
    expect(onFiles).toHaveBeenCalledWith([photo]);
    expect(screen.getByRole("progressbar", { name: "front.jpg" }).getAttribute("aria-valuenow")).toBe("40");
    expect(screen.getByText("Only JPG or PNG.")).toBeTruthy();
  });
});
