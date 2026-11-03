import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GoogleAnalytics, GoogleSiteVerification } from "../components/google-tags";
import { ga4Id, gscVerificationToken } from "../lib/google-tags";

/** next/script injects on the client and renders nothing in static markup, so the tests see it as a plain script that shows its strategy. */
vi.mock("next/script", () => ({
  default: ({ children, strategy, ...rest }: { children?: string; strategy?: string; src?: string; id?: string }) =>
    createElement("script", { ...rest, "data-strategy": strategy, ...(children ? { dangerouslySetInnerHTML: { __html: children } } : {}) }),
}));

vi.mock("../lib/brandbasket", () => ({ brandbasketGet: vi.fn(async () => ({ kind: "ok", data: { business: "Riverside Dental" } })) }));

const TOKEN = "abcdefghij0123456789_-ABCD";
const ID = "G-AB12CD34EF";

afterEach(() => vi.unstubAllEnvs());

describe("gscVerificationToken", () => {
  it("returns a valid token, trimmed", () => {
    expect(gscVerificationToken({ NEXT_PUBLIC_GSC_VERIFICATION: ` ${TOKEN} ` })).toBe(TOKEN);
  });

  it.each([undefined, "", "   ", "short", "a".repeat(101), `${TOKEN}"><script>`, "has space in it 0123456789"])("ignores %j", (value) => {
    expect(gscVerificationToken({ NEXT_PUBLIC_GSC_VERIFICATION: value })).toBeUndefined();
  });
});

describe("ga4Id", () => {
  it("returns a valid id, trimmed", () => {
    expect(ga4Id({ NEXT_PUBLIC_GA4_ID: ` ${ID} ` })).toBe(ID);
  });

  it.each([undefined, "", "G-", "G-ABC", "g-ab12cd34ef", "UA-12345-1", "AW-12345678", `${ID}');alert(1);//`, "G-" + "A".repeat(21)])("ignores %j", (value) => {
    expect(ga4Id({ NEXT_PUBLIC_GA4_ID: value })).toBeUndefined();
  });
});

describe("GoogleSiteVerification", () => {
  it("renders the meta tag when there is a token", () => {
    expect(renderToStaticMarkup(createElement(GoogleSiteVerification, { token: TOKEN }))).toBe(`<meta name="google-site-verification" content="${TOKEN}"/>`);
  });

  it("renders nothing without a token", () => {
    expect(renderToStaticMarkup(createElement(GoogleSiteVerification, {}))).toBe("");
  });
});

describe("GoogleAnalytics", () => {
  it("loads gtag after hydration and configures the id", () => {
    const html = renderToStaticMarkup(createElement(GoogleAnalytics, { id: ID }));
    expect(html).toContain(`https://www.googletagmanager.com/gtag/js?id=${ID}`);
    expect(html).toContain(`gtag('config','${ID}')`);
    expect(html.match(/data-strategy="afterInteractive"/g)).toHaveLength(2);
  });

  it("renders nothing without an id", () => {
    expect(renderToStaticMarkup(createElement(GoogleAnalytics, {}))).toBe("");
  });
});

describe("RootLayout", () => {
  const renderLayout = async (): Promise<string> => {
    const { default: RootLayout } = await import("../app/layout");
    return renderToStaticMarkup(await RootLayout({ children: createElement("main", null, "Hello") }));
  };

  it("renders nothing Google related when both values are unset", async () => {
    vi.stubEnv("NEXT_PUBLIC_GSC_VERIFICATION", "");
    vi.stubEnv("NEXT_PUBLIC_GA4_ID", "");
    const html = (await renderLayout()).toLowerCase();
    expect(html).toContain("hello");
    for (const word of ["google", "gtag", "datalayer", "googletagmanager"]) expect(html).not.toContain(word);
  });

  it("renders nothing Google related when both values are malformed", async () => {
    vi.stubEnv("NEXT_PUBLIC_GSC_VERIFICATION", "<script>");
    vi.stubEnv("NEXT_PUBLIC_GA4_ID", "UA-1");
    const html = (await renderLayout()).toLowerCase();
    for (const word of ["google", "gtag", "datalayer", "<script"]) expect(html).not.toContain(word);
  });

  it("puts the verification meta tag in the head", async () => {
    vi.stubEnv("NEXT_PUBLIC_GSC_VERIFICATION", TOKEN);
    vi.stubEnv("NEXT_PUBLIC_GA4_ID", "");
    const html = await renderLayout();
    expect(html).toMatch(new RegExp(`<head>.*<meta name="google-site-verification" content="${TOKEN}"/>.*</head>`));
    expect(html).not.toContain("gtag");
  });

  it("loads gtag when the id is set, without a verification tag", async () => {
    vi.stubEnv("NEXT_PUBLIC_GSC_VERIFICATION", "");
    vi.stubEnv("NEXT_PUBLIC_GA4_ID", ID);
    const html = await renderLayout();
    expect(html).toContain(`gtag/js?id=${ID}`);
    expect(html).not.toContain("google-site-verification");
  });
});
