import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/app/app-host/(protected)/social/actions", () => ({ approvePostsAction: vi.fn(), connectChannelAction: vi.fn() }));
vi.mock("@/app/app-host/(protected)/setup-actions", () => ({ saveSetupItemAction: vi.fn() }));

import { SocialView } from "@/components/social/social-view";
import { DARK_BUTTON } from "@/components/v2/classes";
import type { SocialConnect, SocialData } from "@/lib/server/social";
import type { CalendarPost } from "@/lib/social/auto";

const NOW = new Date("2026-11-02T05:00:00.000Z");
const text = (element: ReturnType<typeof createElement>): string => renderToStaticMarkup(element).replaceAll("<!-- -->", "");
const count = (html: string, part: string): number => html.split(part).length - 1;

const post = (overrides: Partial<CalendarPost>): CalendarPost => ({
  id: "p",
  day: "2026-11-04",
  time: "10:00",
  caption: "Fresh sourdough every morning.",
  state: "scheduled",
  manual: false,
  channels: [{ platform: "instagram", account: "acme_foods", state: "scheduled", permalink: null }],
  ...overrides,
});

const connect = (overrides: Partial<SocialConnect> = {}): SocialConnect => ({
  businessName: "Acme Foods",
  channels: [
    { id: "instagram:1", platform: "instagram", account: "acme_foods", connectedAt: "2026-10-30T09:00:00Z", expiresAt: "2027-01-01T00:00:00Z" },
    { id: "linkedin:9", platform: "linkedin", account: "Meera Nair", connectedAt: "2026-10-30T09:00:00Z", expiresAt: "2026-11-07T06:00:00.000Z" },
  ],
  posts: [
    post({ id: "done", day: "2026-11-02", state: "published", caption: "Our rye loaf is back.", channels: [{ platform: "instagram", account: "acme_foods", state: "published", permalink: null }] }),
    post({ id: "next", day: "2026-11-04" }),
  ],
  today: "2026-11-02",
  unavailable: false,
  ...overrides,
});

function view(connectData: SocialConnect | null): string {
  const data: SocialData = { connect: connectData, posts: [], monthLine: null, report: null };
  return text(createElement(SocialView, { data, notice: null, now: NOW }));
}

describe("the Social media page with social-auto switched on", () => {
  it("shows the channels column with each account, its network and its state, and a Connect button for the one that is missing", () => {
    const html = view(connect());
    expect(html).toContain("Channels");
    expect(html).toContain("acme_foods");
    expect(html).toContain("Meera Nair");
    // Each account is its logo and its name; the network is only for screen readers.
    expect(html).not.toContain("Instagram · Acme Foods");
    expect(html).toContain("acme_foods<span class=\"sr-only\">, Instagram</span>");
    expect(html).toContain("Facebook");
    expect(html).toContain("Ends in 5 days");
    expect(html).toContain("Connect Facebook");
    expect(html).not.toContain("Connect Instagram");
    expect(html).toContain("Posts booked until 4 Nov.");
  });

  it("puts a card at the top for a phone when a connection must be renewed, with the one dark button", () => {
    const html = view(connect());
    expect(count(html, "LinkedIn needs you again soon")).toBe(1);
    expect(count(html, "Reconnect LinkedIn")).toBe(1);
    expect(html).toContain("connect-status-title");
    expect(html).toContain("lg:hidden");
    expect(count(html, DARK_BUTTON)).toBe(1);
  });

  it("has no status card under the channels: each row carries its own Reconnect or Connect button", () => {
    const html = view(connect());
    expect(html).not.toContain("connect-status-title-channels");
    expect(count(html, ">Reconnect<")).toBe(1);
    expect(html).toContain("Connect Facebook");
  });

  it("draws the week, with each post's time, words and where it stands", () => {
    const html = view(connect());
    expect(html).toContain("2 Nov to 8 Nov 2026");
    expect(html).toContain("Our rye loaf is back.");
    expect(html).toContain("Posted");
    expect(html).toContain("Fresh sourdough every morning.");
    expect(html).toContain("Scheduled");
    expect(html).not.toContain("This week");
  });

  it("asks the customer to connect when there is no account, and says the calendar is empty", () => {
    const html = view(connect({ channels: [], posts: [] }));
    expect(html).toContain("Let us start your social posts");
    expect(html).toContain("Connect your accounts");
    expect(html).toContain("Nothing is scheduled for this week yet.");
    expect(html).toContain("No posts are booked yet.");
    expect(count(html, DARK_BUTTON)).toBe(1);
  });

  it("has no status card and no dark button when the accounts are connected and nothing is needed", () => {
    const html = view(connect({ channels: [connect().channels[0] as SocialConnect["channels"][number]] }));
    expect(html).not.toContain("Posting three times a week");
    expect(html).not.toContain("Ask for a change");
    expect(html).not.toContain("connect-status-title");
    expect(count(html, DARK_BUTTON)).toBe(0);
  });

  it("says when the posting service could not be reached", () => {
    expect(view(connect({ unavailable: true }))).toContain("We could not reach the posting service just now");
    expect(view(connect())).not.toContain("We could not reach the posting service");
  });

  it("is the page it always was when social-auto is not set up", () => {
    const html = view(null);
    expect(html).not.toContain("Channels");
    expect(html).not.toContain("calendar-title");
    expect(html).toContain("This week");
  });
});

describe("when the team has paused posting", () => {
  const channels = connect().channels;

  it("says Paused under a channel that is held back, and says nothing when none is", () => {
    const some = view(connect({ channels: channels.map((channel, index) => (index === 0 ? { ...channel, paused: true } : channel)) }));
    expect(count(some, ">Paused<")).toBe(1);
    expect(some).not.toContain("Your posts are paused");
    expect(view(connect())).not.toContain(">Paused<");
  });

  it("puts one plain notice at the top when every account is held back", () => {
    const html = view(connect({ channels: channels.map((channel) => ({ ...channel, paused: true })) }));
    expect(html).toContain("Your posts are paused. Nothing is being sent for now.");
    expect(count(html, ">Paused<")).toBe(channels.length);
    expect(view(connect({ channels: [], posts: [] }))).not.toContain("Your posts are paused");
  });
});

describe("adding a post from the calendar", () => {
  const free = (html: string): string[] => [...html.matchAll(/aria-label="New post on ([^"]+)"/g)].map((match) => match[1]?.replace(/ at .*$/, "") as string);
  const slots = (html: string): string[] => [...html.matchAll(/aria-label="New post on ([^"]+)"/g)].map((match) => match[1] as string);

  it("opens a free slot of a later day, and of today's hours, and has a New post button for the keyboard", () => {
    const html = view(connect());
    const days = new Set(free(html));
    expect(days.has("Tuesday 3 November")).toBe(true);
    expect(days.has("Sunday 8 November")).toBe(true);
    // Today's hours are offered too; the ones that have gone are hidden in the browser, which knows the time (the server draws none).
    expect(slots(html)).toContain("Monday 2 November at 11:00 AM");
    expect(html).toContain("New post");
    expect(html).not.toContain("new-post-title");
  });

  it("leaves out the slots a post already fills", () => {
    const withPost = view(connect({ posts: [post({ id: "next", day: "2026-11-04", time: "10:00" })] }));
    const wednesday = free(withPost).filter((day) => day === "Wednesday 4 November").length;
    expect(wednesday).toBe(23);
  });

  it("cannot add a post when no account is connected: no slots to click, no New post button", () => {
    const html = view(connect({ channels: [], posts: [] }));
    expect(free(html)).toEqual([]);
    expect(html).not.toContain("New post");
  });
});
