import { renderToStaticMarkup } from "react-dom/server";
import type { ReactElement } from "react";
import { describe, expect, it, vi } from "vitest";
import { PreviewApprove } from "./preview-approve";
import { ProgressCard } from "./preview-card";

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

function previewCard(roundsUsedUp: boolean, roundsLine: string): string {
  return render(
    <ProgressCard
      view={{ kind: "preview", title: "Your preview is ready", line: null }}
      pictureUrl={null}
      previewUrl="https://preview.example.com/site"
      address={null}
      businessName="Riverside Plumbing"
      liveHostname={null}
      feedbackKey="key-1"
      roundsLine={roundsLine}
      roundsUsedUp={roundsUsedUp}
    />,
  );
}

describe("ProgressCard on a preview", () => {
  const html = previewCard(false, "Two rounds of changes are included.");

  it("puts approving behind the confirm step rather than a form that posts at once", () => {
    expect(html).toContain(">Approve</button>");
    expect(html).not.toContain("<form");
  });
});

describe("ProgressCard on a preview with every round used", () => {
  const html = previewCard(true, "Further changes are quoted first.");

  it("takes the Ask for changes box away and says further changes are quoted first", () => {
    expect(html).not.toContain("Ask for changes");
    expect(html).toContain("Further changes are quoted first.");
  });

  it("still lets the customer approve and open the preview, and points to the usual way to ask for a change", () => {
    expect(html).toContain(">Approve</button>");
    expect(html).toContain("Open preview");
    expect(html).toContain('href="/requests/new?kind=website&amp;page="');
    expect(html).toContain(">Ask for a change</a>");
  });
});
