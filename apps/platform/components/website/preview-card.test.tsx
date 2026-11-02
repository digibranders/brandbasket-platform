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

describe("ProgressCard on a preview", () => {
  const html = render(
    <ProgressCard
      view={{ kind: "preview", title: "Your preview is ready", line: null }}
      pictureUrl={null}
      previewUrl="https://preview.example.com/site"
      address={null}
      businessName="Riverside Plumbing"
      liveHostname={null}
      feedbackKey="key-1"
      roundsLine="Two rounds of changes are included."
    />,
  );

  it("puts approving behind the confirm step rather than a form that posts at once", () => {
    expect(html).toContain(">Approve</button>");
    expect(html).not.toContain("<form");
  });
});
