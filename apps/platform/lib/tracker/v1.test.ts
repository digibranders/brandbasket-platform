import { readFileSync } from "node:fs";
import { gzipSync } from "node:zlib";
import { Window } from "happy-dom";
import { describe, expect, it, vi } from "vitest";
import { parseHit } from "@brandbasket/shared/lib/analytics/payload";

const SOURCE = readFileSync(new URL("../../public/t/v1.js", import.meta.url), "utf8");
const KEY = "bbk_abcdefghijklmnop";

interface Sent {
  readonly url: string;
  readonly body: Record<string, unknown>;
  readonly init: RequestInit;
}

interface Page {
  readonly window: Window;
  readonly sent: Sent[];
  /** The messages the script sent, newest last. */
  readonly kinds: () => string[];
}

interface PageOptions {
  readonly url?: string;
  readonly referrer?: string;
  readonly scriptAttributes?: Record<string, string>;
  readonly body?: string;
  readonly doNotTrack?: boolean;
  readonly webdriver?: boolean;
  readonly visibility?: "visible" | "prerender";
  readonly withFetch?: boolean;
}

/** A fresh browser window with the script run in it, so nothing leaks from one test to the next. */
function open(options: PageOptions = {}): Page {
  const window = new Window({ url: options.url ?? "https://saidental.in/about" });
  const document = window.document;
  document.body.innerHTML = options.body ?? "";
  const script = document.createElement("script");
  script.setAttribute("data-key", KEY);
  script.setAttribute("data-endpoint", "https://app.brandbasket.in/api/t");
  for (const [name, value] of Object.entries(options.scriptAttributes ?? {})) script.setAttribute(name, value);
  document.head.appendChild(script);
  if (options.referrer !== undefined) Object.defineProperty(document, "referrer", { value: options.referrer });
  Object.defineProperty(document, "visibilityState", { value: options.visibility ?? "visible", configurable: true, writable: true });
  Object.defineProperty(window.navigator, "doNotTrack", { value: options.doNotTrack === true ? "1" : null });
  Object.defineProperty(window.navigator, "webdriver", { value: options.webdriver === true });

  const sent: Sent[] = [];
  const fetchSpy = vi.fn((url: string, init: RequestInit) => {
    sent.push({ url, body: JSON.parse(String(init.body)) as Record<string, unknown>, init });
    return Promise.resolve(new Response(null, { status: 204 }));
  });
  const globals: Record<string, unknown> = { window, document, navigator: window.navigator, location: window.location, history: window.history, URL, URLSearchParams, Date, setTimeout: window.setTimeout.bind(window), Blob };
  if (options.withFetch !== false) globals.fetch = fetchSpy;
  else globals.fetch = undefined;
  new Function(...Object.keys(globals), SOURCE)(...Object.values(globals));
  return { window, sent, kinds: () => sent.map((entry) => String(entry.body.kind)) };
}

const click = (window: Window, selector: string): void => {
  const element = window.document.querySelector(selector);
  if (element === null) throw new Error(`No ${selector} on the page`);
  element.dispatchEvent(new window.MouseEvent("click", { bubbles: true, cancelable: true }));
};

describe("the tracking script", () => {
  it("stays small, so it never slows a customer's page", () => {
    expect(gzipSync(SOURCE).byteLength).toBeLessThan(3072);
  });

  it("sends a page view when the page loads, with the key and the path", () => {
    const page = open();
    expect(page.sent).toHaveLength(1);
    expect(page.sent[0]?.url).toBe("https://app.brandbasket.in/api/t");
    expect(page.sent[0]?.body).toEqual({ key: KEY, kind: "pageview", path: "/about" });
  });

  it("sends nothing that carries cookies or reads storage", () => {
    const page = open();
    expect(page.sent[0]?.init).toMatchObject({ method: "POST", keepalive: true, credentials: "omit" });
    expect(SOURCE).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
  });

  it("sends the referring site's origin only, and the campaign from the address", () => {
    const page = open({ url: "https://saidental.in/?utm_source=Google&utm_medium=cpc&utm_campaign=Diwali&email=asha@example.com", referrer: "https://www.google.com/search?q=asha+dentist" });
    expect(page.sent[0]?.body).toEqual({ key: KEY, kind: "pageview", path: "/", ref: "https://www.google.com", source: "Google", medium: "cpc", campaign: "Diwali" });
  });

  it("does not send a referrer that is the site itself", () => {
    const page = open({ referrer: "https://saidental.in/services" });
    expect(page.sent[0]?.body).not.toHaveProperty("ref");
  });

  it("sends a message the server accepts, whatever the page", () => {
    const page = open({ url: "https://saidental.in/a/b?x=1#frag", referrer: "https://l.instagram.com/?u=1" });
    expect(parseHit(JSON.stringify(page.sent[0]?.body))).toMatchObject({ kind: "pageview", path: "/a/b", referrerHost: "l.instagram.com" });
  });

  it("does nothing for a visitor who asked not to be tracked, or for an automated browser", () => {
    expect(open({ doNotTrack: true }).sent).toHaveLength(0);
    expect(open({ webdriver: true }).sent).toHaveLength(0);
  });

  it("does nothing without a key", () => {
    const window = new Window({ url: "https://saidental.in/" });
    Object.defineProperty(window.navigator, "webdriver", { value: false });
    const fetchSpy = vi.fn();
    new Function("window", "document", "navigator", "location", "history", "fetch", "URL", "URLSearchParams", "Date", "setTimeout", "Blob", SOURCE)(window, window.document, window.navigator, window.location, window.history, fetchSpy, URL, URLSearchParams, Date, setTimeout, Blob);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it("waits for a prerendered page to be shown before counting it", () => {
    const page = open({ visibility: "prerender" });
    expect(page.sent).toHaveLength(0);
    Object.defineProperty(page.window.document, "visibilityState", { value: "visible" });
    page.window.document.dispatchEvent(new page.window.Event("visibilitychange"));
    expect(page.kinds()).toEqual(["pageview"]);
  });

  it("falls back to a beacon when fetch is missing", () => {
    const beacon = vi.fn(() => true);
    const window = new Window({ url: "https://saidental.in/" });
    const script = window.document.createElement("script");
    script.setAttribute("data-key", KEY);
    script.setAttribute("data-endpoint", "https://app.brandbasket.in/api/t");
    window.document.head.appendChild(script);
    Object.defineProperty(window.navigator, "webdriver", { value: false });
    Object.defineProperty(window.navigator, "sendBeacon", { value: beacon });
    new Function("window", "document", "navigator", "location", "history", "fetch", "URL", "URLSearchParams", "Date", "setTimeout", "Blob", SOURCE)(window, window.document, window.navigator, window.location, window.history, undefined, URL, URLSearchParams, Date, setTimeout, Blob);
    expect(beacon).toHaveBeenCalledTimes(1);
  });

  describe("taps", () => {
    const body = `
      <a id="call" href="tel:+919876543210">Call</a>
      <a id="mail" href="mailto:hello@saidental.in">Email</a>
      <a id="wa" href="https://wa.me/919876543210?text=hi">WhatsApp</a>
      <a id="wa2" href="https://api.whatsapp.com/send?phone=919876543210">WhatsApp</a>
      <a id="map" href="https://maps.app.goo.gl/abc123">Directions</a>
      <a id="map2" href="https://www.google.com/maps/dir/?api=1&destination=Sai+Dental">Directions</a>
      <a id="ig" href="https://www.instagram.com/saidental/">Instagram</a>
      <a id="out" href="https://www.justdial.com/sai-dental">Justdial</a>
      <a id="pdf" href="/files/price-list.PDF">Price list</a>
      <a id="inner" href="/services"><span id="inside">Services</span></a>
      <a id="mailtap" href="mailto:x@y.in"><b id="bold">Mail us</b></a>
      <button id="book" data-bb-event="Book-Now">Book</button>
      <a id="both" href="tel:+911" data-bb-event="hotline">Hotline</a>
      <button id="badname" data-bb-event="Book Now!">Book</button>
      <form id="form"><input name="name" value="Asha"><button type="submit">Send</button></form>`;

    const cases: readonly [string, Record<string, unknown>][] = [
      ["#call", { kind: "call" }],
      ["#mail", { kind: "email" }],
      ["#wa", { kind: "whatsapp" }],
      ["#wa2", { kind: "whatsapp" }],
      ["#map", { kind: "directions" }],
      ["#map2", { kind: "directions" }],
      ["#ig", { kind: "social", label: "instagram.com" }],
      ["#out", { kind: "outbound", label: "justdial.com" }],
      ["#pdf", { kind: "download", label: "pdf" }],
      ["#bold", { kind: "email" }],
      ["#book", { kind: "custom", label: "book-now" }],
      ["#both", { kind: "custom", label: "hotline" }],
    ];

    for (const [selector, expected] of cases) {
      it(`reports ${selector} as ${String(expected.kind)}`, () => {
        const page = open({ body });
        click(page.window, selector);
        expect(page.sent).toHaveLength(2);
        expect(page.sent[1]?.body).toEqual({ key: KEY, path: "/about", ...expected });
        expect(parseHit(JSON.stringify(page.sent[1]?.body))).not.toBeNull();
      });
    }

    it("says nothing for a link inside the site, or a custom name that is not valid", () => {
      const page = open({ body });
      click(page.window, "#inside");
      click(page.window, "#badname");
      expect(page.kinds()).toEqual(["pageview"]);
    });

    it("counts a double click once", () => {
      const page = open({ body });
      click(page.window, "#call");
      click(page.window, "#call");
      expect(page.kinds()).toEqual(["pageview", "call"]);
    });

    it("reports a form send, without reading a single field", () => {
      const page = open({ body });
      page.window.document.querySelector("#form")?.dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
      expect(page.sent[1]?.body).toEqual({ key: KEY, kind: "form", path: "/about" });
      expect(JSON.stringify(page.sent)).not.toContain("Asha");
    });

    it("ignores forms on a site that counts them on its own server", () => {
      const page = open({ body, scriptAttributes: { "data-bb-forms": "server" } });
      page.window.document.querySelector("#form")?.dispatchEvent(new page.window.Event("submit", { bubbles: true, cancelable: true }));
      expect(page.kinds()).toEqual(["pageview"]);
    });

    it("offers window.bb for an event the site fires itself", () => {
      const page = open();
      (page.window as unknown as { bb: (name: string) => void }).bb("Quote-Sent");
      expect(page.sent[1]?.body).toEqual({ key: KEY, kind: "custom", path: "/about", label: "quote-sent" });
    });
  });

  describe("engagement", () => {
    it("reports time on the page and the furthest scroll when the page is hidden", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-05T10:00:00.000Z"));
      const page = open();
      const window = page.window as unknown as { scrollY: number; innerHeight: number; document: Document };
      Object.defineProperty(window.document.documentElement, "scrollHeight", { value: 2000, configurable: true });
      Object.defineProperty(window, "innerHeight", { value: 800, configurable: true });
      Object.defineProperty(window, "scrollY", { value: 600, configurable: true });
      page.window.dispatchEvent(new page.window.Event("scroll"));
      vi.setSystemTime(new Date("2026-10-05T10:00:12.400Z"));
      Object.defineProperty(page.window.document, "visibilityState", { value: "hidden" });
      page.window.document.dispatchEvent(new page.window.Event("visibilitychange"));
      expect(page.sent[1]?.body).toEqual({ key: KEY, kind: "engagement", path: "/about", engagedMs: 12400, scrollPct: 70 });
      vi.useRealTimers();
    });

    it("sends the time once, not again on pagehide", () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-10-05T10:00:00.000Z"));
      const page = open();
      vi.setSystemTime(new Date("2026-10-05T10:00:05.000Z"));
      Object.defineProperty(page.window.document, "visibilityState", { value: "hidden" });
      page.window.document.dispatchEvent(new page.window.Event("visibilitychange"));
      page.window.dispatchEvent(new page.window.Event("pagehide"));
      expect(page.kinds()).toEqual(["pageview", "engagement"]);
      vi.useRealTimers();
    });
  });

  describe("pages that change without reloading", () => {
    it("counts a new page view for a new path, and not for the same path again", () => {
      const page = open();
      page.window.history.pushState({}, "", "/services");
      page.window.history.replaceState({}, "", "/services");
      page.window.history.pushState({}, "", "/contact?utm_source=ig");
      expect(page.sent.filter((entry) => entry.body.kind === "pageview").map((entry) => entry.body.path)).toEqual(["/about", "/services", "/contact"]);
      expect(page.sent[page.sent.length - 1]?.body).not.toHaveProperty("ref");
    });
  });
});
