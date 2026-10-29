import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { BrandAssetsPanel } from "@/components/panel/details/brand-assets-panel";
import type { BrandAssets, BrandImage } from "@/lib/server/brand-assets";

const image = (id: string): BrandImage => ({ id, width: 800, height: 600, altText: null, originalFilename: `${id}.jpg` });
const render = (assets: BrandAssets): string => renderToStaticMarkup(createElement(BrandAssetsPanel, { assets, remove: async () => ({ ok: true as const }) })).replaceAll("<!-- -->", "");

it("offers to upload a logo and photos when there are none, without inventing any", () => {
  const html = render({ logo: null, photos: [] });
  expect(html).toContain("No logo yet.");
  expect(html).toContain("Upload your logo");
  expect(html).toContain("Add photos");
  expect(html).toContain("0 of 20");
  expect(html).not.toContain("<img");
});

it("shows the logo with a way to replace or remove it, and each photo with its own remove", () => {
  const html = render({ logo: image("0192f3c4-0000-7000-8000-000000000001"), photos: [image("0192f3c4-0000-7000-8000-000000000002"), image("0192f3c4-0000-7000-8000-000000000003")] });
  expect(html).toContain("Replace your logo");
  expect(html).toContain("Remove logo");
  expect(html).toContain('aria-label="Remove photo 1"');
  expect(html).toContain('aria-label="Remove photo 2"');
  expect(html).toContain("2 of 20");
  expect(html).toContain("/media/0192f3c4-0000-7000-8000-000000000002");
});

it("stops offering photos at the limit", () => {
  const photos = Array.from({ length: 20 }, (_, index) => image(`0192f3c4-0000-7000-8000-0000000000${String(index).padStart(2, "0")}`));
  const html = render({ logo: null, photos });
  expect(html).toMatch(/<input type="file"[^>]*disabled=""[^>]*multiple|<input type="file"[^>]*multiple[^>]*disabled=""/);
});

it("points other file types, such as an SVG logo, to the team, and never uses a dash", () => {
  const html = render({ logo: null, photos: [] });
  expect(html).toContain('href="/requests/new?intent=send_info"');
  expect(html.replace(/<[^>]+>/g, " ")).not.toMatch(/[–—]/);
});
