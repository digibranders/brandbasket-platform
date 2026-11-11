import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import type { ChangesView, InProgressRow, VersionRow } from "@/lib/website/history";
import { PreviewApprove } from "./preview-approve";
import { PreviewCard } from "./preview-card";

vi.mock("@/app/app-host/(protected)/website/actions", () => ({
  approvePreviewAction: vi.fn(),
  sendPreviewFeedbackAction: vi.fn(),
}));

const render = (element: ReactElement): string => renderToStaticMarkup(element).replaceAll("<!-- -->", "");

describe("PreviewApprove", () => {
  it("opens as one Approve button that submits nothing, so a single tap cannot approve", () => {
    const html = render(<PreviewApprove />);
    expect(html).toContain(">Approve</button>");
    expect(html).toContain('type="button"');
    expect(html).not.toContain("<form");
    expect(html).not.toContain("Yes, approve");
  });
});

const row = (over: Partial<VersionRow>): VersionRow => ({
  version: 1,
  host: "www.example.com",
  href: "https://www.example.com/preview",
  sent: "Mon 2 Nov, 3:57 pm",
  outcome: null,
  live: false,
  newest: true,
  ...over,
});

interface Options {
  readonly rows?: readonly VersionRow[];
  readonly inProgress?: InProgressRow | null;
  readonly changes?: ChangesView | null;
  readonly reviewing?: boolean;
  readonly roundsUsedUp?: boolean;
  readonly roundsLine?: string;
}

function card(options: Options = {}): string {
  return render(
    <PreviewCard
      rows={options.rows ?? [row({})]}
      inProgress={options.inProgress ?? null}
      changes={options.changes ?? null}
      reviewing={options.reviewing ?? false}
      pictureUrl={null}
      previewUrl="https://www.example.com/preview"
      address={null}
      businessName="Riverside Plumbing"
      feedbackKey="key-1"
      roundsLine={options.roundsLine ?? "Two rounds of changes are included."}
      roundsUsedUp={options.roundsUsedUp ?? false}
    />,
  );
}

describe("PreviewCard history", () => {
  it("lists the versions in the order given, each with host, sent time and an Open preview link that opens safely in a new tab", () => {
    const html = card({
      rows: [row({ version: 2, outcome: "You asked for changes" }), row({ version: 1, newest: false, outcome: "You asked for changes", sent: "Sun 1 Nov, 9:00 am" })],
    });
    expect(html).toContain("Your preview");
    expect(html).toContain("Every version we have sent you, newest first.");
    expect(html.indexOf("Version 2")).toBeLessThan(html.indexOf("Version 1"));
    expect(html).toContain("www.example.com");
    expect(html).not.toContain("font-figure");
    expect(html).toContain("Mon 2 Nov, 3:57 pm");
    expect(html).toContain("You asked for changes");
    expect(html.match(/Open preview/g)).toHaveLength(2);
    expect(html.match(/target="_blank" rel="noopener noreferrer"/g)).toHaveLength(2);
  });

  it("marks the live version", () => {
    expect(card({ rows: [row({ live: true, outcome: "You approved it" })] })).toContain("Live now");
    expect(card()).not.toContain("Live now");
  });

  it("puts the version being made at the top, with its day, and says we are on it", () => {
    const html = card({ rows: [row({ outcome: "You asked for changes" })], inProgress: { version: 2, readyBy: "Wed 4 Nov" } });
    expect(html.indexOf("Version 2")).toBeLessThan(html.indexOf("Version 1"));
    expect(html).toContain("In progress");
    expect(html).toContain("ready by");
    expect(html).toContain("Wed 4 Nov");
    expect(html).toContain("We are on it");
  });

  it("names no day for the version being made when none is promised", () => {
    const html = card({ rows: [], inProgress: { version: 1, readyBy: null } });
    expect(html).toContain("In progress");
    expect(html).not.toContain("ready by");
  });

  it("says plainly that nothing was sent before the first preview, with no Open preview", () => {
    const html = card({ rows: [] });
    expect(html).toContain("No preview has been sent yet.");
    expect(html).not.toContain("Every version we have sent you");
    expect(html).not.toContain("Open preview");
  });

  it("shows no Open preview for a stored link that is not https", () => {
    expect(card({ rows: [row({ href: null })] })).not.toContain("Open preview");
  });
});

describe("PreviewCard while the customer checks the preview", () => {
  it("puts Approve and Ask for changes on the newest version only, behind the confirm step", () => {
    const html = card({ reviewing: true, rows: [row({ version: 2 }), row({ version: 1, newest: false, outcome: "You asked for changes" })] });
    expect(html.match(/>Approve<\/button>/g)).toHaveLength(1);
    expect(html.match(/>Ask for changes<\/button>/g)).toHaveLength(1);
    expect(html).not.toContain("<form");
    expect(html.indexOf(">Approve</button>")).toBeLessThan(html.indexOf("Version 1"));
  });

  it("has no Approve or Ask for changes in any other stage", () => {
    const html = card({ reviewing: false });
    expect(html).not.toContain(">Approve</button>");
    expect(html).not.toContain("Ask for changes");
  });

  it("takes the Ask for changes box away when every round is used, says further changes are quoted first and still lets the customer approve", () => {
    const html = card({ reviewing: true, roundsUsedUp: true, roundsLine: "Further changes are quoted first." });
    expect(html).not.toContain("Ask for changes");
    expect(html).toContain("Further changes are quoted first.");
    expect(html).toContain(">Approve</button>");
    expect(html).toContain("Open preview");
    expect(html).toContain('href="/requests/new?kind=website"');
    expect(html).toContain(">Ask for a change</a>");
  });
});

describe("PreviewCard changes", () => {
  const changes: ChangesView = { round: 1, of: 2, asked: "Mon 2 Nov, 4:05 pm", text: "Update the hero heading", requestHref: "/requests?open=ticket-1", doneIn: null };

  it("shows the round, when it was asked, what was written, clamped, and a link to the request", () => {
    const html = card({ changes });
    expect(html).toContain("Your changes");
    expect(html).toContain("Round 1 of 2");
    expect(html).toContain("Mon 2 Nov, 4:05 pm");
    expect(html).toContain("Update the hero heading");
    expect(html).toContain("line-clamp-6");
    expect(html).toContain('href="/requests?open=ticket-1"');
    expect(html).toContain("See your request");
    expect(html).not.toContain("Done in Version");
  });

  it("says which version the changes were done in", () => {
    expect(card({ changes: { ...changes, doneIn: 2 } })).toContain("Done in Version 2");
  });

  it("leaves the block out when no changes were sent", () => {
    expect(card()).not.toContain("Your changes");
  });
});
