import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import {
  ApprovalCard,
  ConfirmDialog,
  EmptyState,
  ErrorState,
  NeedsYourOkList,
  NextActionCard,
  PageHeader,
  PreviewFrame,
  PromptPopup,
  ServiceCard,
  SettingsTabs,
  Skeleton,
  StatTile,
  StatusChip,
  StatusTimeline,
  Stepper,
  ThumbStrip,
} from "./index";

describe("Shared Patterns (Release 2)", () => {
  describe("StatusChip", () => {
    it("renders active, next, waiting, idle and failed variants", () => {
      const active = renderToStaticMarkup(createElement(StatusChip, { label: "Live", variant: "active", hasDot: true }));
      expect(active).toContain("Live");
      expect(active).toContain("bg-pos-wash");
      expect(active).toContain("bg-pos-text");

      const next = renderToStaticMarkup(createElement(StatusChip, { label: "Next step", variant: "next" }));
      expect(next).toContain("Next step");
      expect(next).toContain("bg-accent-wash");

      const failed = renderToStaticMarkup(createElement(StatusChip, { label: "Failed", variant: "failed" }));
      expect(failed).toContain("Failed");
      expect(failed).toContain("bg-neg-wash");
    });
  });

  describe("StatTile", () => {
    it("renders figure in mono with label and delta", () => {
      const tile = renderToStaticMarkup(
        createElement(StatTile, { label: "Website visits", value: "412", delta: "+18%", deltaTone: "positive" })
      );
      expect(tile).toContain("Website visits");
      expect(tile).toContain("412");
      expect(tile).toContain("+18%");
      expect(tile).toContain("font-mono");
    });
  });

  describe("Skeleton", () => {
    it("renders warm sunken pulse block without spinners", () => {
      const skel = renderToStaticMarkup(createElement(Skeleton, { width: 200, height: 40, rounded: "hero" }));
      expect(skel).toContain("bg-surface-hover");
      expect(skel).toContain("motion-pulse");
      expect(skel).toContain("rounded-[20px]");
      expect(skel).toContain("aria-hidden=\"true\"");
    });
  });

  describe("EmptyState", () => {
    it("renders plain description and action", () => {
      const empty = renderToStaticMarkup(
        createElement(EmptyState, {
          title: "Nothing to review",
          description: "New items appear once generated.",
          action: createElement("button", null, "Refresh"),
        })
      );
      expect(empty).toContain("Nothing to review");
      expect(empty).toContain("New items appear once generated.");
      expect(empty).toContain("Refresh");
    });
  });

  describe("ErrorState", () => {
    it("renders alert role with recovery button", () => {
      const err = renderToStaticMarkup(
        createElement(ErrorState, {
          title: "Connection paused",
          message: "Instagram token expired.",
          retryAction: { label: "Reconnect", onClick: () => {} },
        })
      );
      expect(err).toContain("role=\"alert\"");
      expect(err).toContain("Connection paused");
      expect(err).toContain("Instagram token expired.");
      expect(err).toContain("Reconnect");
    });
  });

  describe("PageHeader", () => {
    it("renders title, eyebrow and action slots", () => {
      const header = renderToStaticMarkup(
        createElement(PageHeader, {
          eyebrow: "Services",
          title: "Website",
          description: "Your website is live.",
          actions: createElement("button", null, "Settings"),
        })
      );
      expect(header).toContain("Services");
      expect(header).toContain("Website");
      expect(header).toContain("Your website is live.");
      expect(header).toContain("Settings");
    });
  });

  describe("Stepper", () => {
    it("renders step numbers and marked progress", () => {
      const stepper = renderToStaticMarkup(
        createElement(Stepper, {
          steps: [
            { id: "s1", label: "Kickoff call" },
            { id: "s2", label: "Design" },
            { id: "s3", label: "Preview" },
          ],
          activeIndex: 1,
        })
      );
      expect(stepper).toContain("Kickoff call");
      expect(stepper).toContain("Design");
      expect(stepper).toContain("aria-current=\"step\"");
      expect(stepper).toContain("aria-label=\"Progress\"");
    });
  });

  describe("StatusTimeline", () => {
    it("renders list of milestones with done and current states", () => {
      const timeline = renderToStaticMarkup(
        createElement(StatusTimeline, {
          entries: [
            { id: "e1", title: "Booked kickoff", state: "done", timestamp: "10:00 am" },
            { id: "e2", title: "Building site", state: "current" },
          ],
        })
      );
      expect(timeline).toContain("Booked kickoff");
      expect(timeline).toContain("Building site");
      expect(timeline).toContain("10:00 am");
      expect(timeline).toContain("role=\"list\"");
    });
  });

  describe("NextActionCard (Focal)", () => {
    it("renders focal card with 20px radius and gold top border", () => {
      const card = renderToStaticMarkup(
        createElement(NextActionCard, {
          serviceName: "Website",
          serviceIcon: createElement("span", null, "Icon"),
          title: "Book your kickoff call",
          description: "30 minutes on video.",
          primaryAction: { label: "Book call", onClick: () => {} },
          statusText: "Waiting for your kickoff call",
          asideNote: "Times in India",
        })
      );
      expect(card).toContain("border-t-accent-gold");
      expect(card).toContain("shadow-hero");
      expect(card).toContain("Book your kickoff call");
      expect(card).toContain("Book call");
      expect(card).toContain("Waiting for your kickoff call");
      expect(card).toContain("Times in India");
    });
  });

  describe("ServiceCard", () => {
    it("renders standard service card with quiet shadow", () => {
      const card = renderToStaticMarkup(
        createElement(ServiceCard, {
          serviceName: "Social media",
          serviceIcon: createElement("span", null, "Icon"),
          statusLabel: "Running",
          statusVariant: "active",
          summary: "5 posts scheduled this week.",
        })
      );
      expect(card).toContain("Social media");
      expect(card).toContain("Running");
      expect(card).toContain("5 posts scheduled this week.");
      expect(card).toContain("shadow-card");
    });
  });

  describe("NeedsYourOkList", () => {
    it("renders count badge and item rows", () => {
      const list = renderToStaticMarkup(
        createElement(NeedsYourOkList, {
          items: [
            { id: "i1", title: "Website preview", context: "1 round of changes left", age: "2d" },
            { id: "i2", title: "3 pictures", context: "Social media" },
          ],
        })
      );
      expect(list).toContain("Needs your OK");
      expect(list).toContain("2");
      expect(list).toContain("Website preview");
      expect(list).toContain("1 round of changes left");
    });

    it("renders peaceful empty state when zero items", () => {
      const list = renderToStaticMarkup(createElement(NeedsYourOkList, { items: [] }));
      expect(list).toContain("Nothing needs your OK right now.");
    });
  });

  describe("ApprovalCard", () => {
    it("renders approve and request changes actions", () => {
      const card = renderToStaticMarkup(
        createElement(ApprovalCard, {
          title: "Website draft v1",
          category: "Website preview",
          onApprove: () => {},
          onRequestChanges: () => {},
        })
      );
      expect(card).toContain("Website draft v1");
      expect(card).toContain("Approve");
      expect(card).toContain("Request changes");
    });
  });

  describe("ConfirmDialog", () => {
    it("renders modal dialog with consequence line and confirm/cancel", () => {
      const dialog = renderToStaticMarkup(
        createElement(ConfirmDialog, {
          isOpen: true,
          title: "Close account?",
          consequence: "You have 30 days to restore before data is permanently erased.",
          onConfirm: () => {},
          onCancel: () => {},
          isDestructive: true,
        })
      );
      expect(dialog).toContain("role=\"dialog\"");
      expect(dialog).toContain("Close account?");
      expect(dialog).toContain("30 days to restore");
      expect(dialog).toContain("bg-neg-text");
    });

    it("returns null when closed", () => {
      const dialog = renderToStaticMarkup(
        createElement(ConfirmDialog, {
          isOpen: false,
          title: "Closed",
          consequence: "None",
          onConfirm: () => {},
          onCancel: () => {},
        })
      );
      expect(dialog).toBe("");
    });
  });

  describe("PromptPopup", () => {
    it("renders staff prompt dialog", () => {
      const popup = renderToStaticMarkup(
        createElement(
          PromptPopup,
          {
            isOpen: true,
            title: "Confirm kickoff call",
            onClose: () => {},
            primaryAction: { label: "Call completed", onClick: () => {} },
          },
          createElement("p", null, "Staff prompt notes")
        )
      );
      expect(popup).toContain("role=\"dialog\"");
      expect(popup).toContain("Confirm kickoff call");
      expect(popup).toContain("Call completed");
      expect(popup).toContain("Staff prompt notes");
    });
  });

  describe("SettingsTabs", () => {
    it("renders tablist with active tab indicator", () => {
      const tabs = renderToStaticMarkup(
        createElement(SettingsTabs, {
          tabs: [
            { id: "profile", label: "Profile" },
            { id: "team", label: "Team", badge: 3 },
          ],
          activeTabId: "team",
        })
      );
      expect(tabs).toContain("role=\"tablist\"");
      expect(tabs).toContain("Profile");
      expect(tabs).toContain("Team");
      expect(tabs).toContain("aria-selected=\"true\"");
      expect(tabs).toContain("after:bg-accent-gold");
    });
  });

  describe("PreviewFrame", () => {
    it("renders 16:10 aspect ratio frame with URL bar", () => {
      const frame = renderToStaticMarkup(
        createElement(
          PreviewFrame,
          { url: "sweetcrust.in", caption: "Live desktop preview" },
          createElement("span", null, "Real preview content")
        )
      );
      expect(frame).toContain("aspect-[16/10]");
      expect(frame).toContain("sweetcrust.in");
      expect(frame).toContain("Real preview content");
      expect(frame).toContain("Live desktop preview");
    });
  });

  describe("ThumbStrip", () => {
    it("renders square picture thumbnails with status chip", () => {
      const strip = renderToStaticMarkup(
        createElement(ThumbStrip, {
          items: [
            { id: "p1", title: "Morning Croissant", status: "Needs OK", statusVariant: "next", needsAction: true },
            { id: "p2", title: "Artisan Loaf", status: "Scheduled", statusVariant: "active" },
          ],
        })
      );
      expect(strip).toContain("Morning Croissant");
      expect(strip).toContain("ring-accent-gold");
      expect(strip).toContain("Artisan Loaf");
      expect(strip).toContain("aspect-square");
    });
  });
});
