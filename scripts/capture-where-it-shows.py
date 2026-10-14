#!/usr/bin/env python3
"""Re-take the picture behind "See where this shows" from the real Firstfold business page.

One full-page screenshot of a well-filled business page, plus the place each dashboard input shows
on it. The dashboard draws the spotlight over the picture, so nothing is baked in. Run it whenever the business page
layout changes, with the website running against a platform that holds that business (demo mode off, so no "Sample"
marks): it needs an offer, services, products, gallery photos, opening hours and an address containing ADDRESS_TEXT.

    python3 scripts/capture-where-it-shows.py <business page url>

It uses the Chrome already installed on this machine, so nothing is downloaded. Output:
  apps/platform/public/where-it-shows/page.webp
  apps/platform/lib/where-it-shows-spots.json   (page size and each spot's box, as fractions of the page)
"""

import io
import json
import sys
from pathlib import Path

from PIL import Image
from playwright.sync_api import Page, sync_playwright

ROOT = Path(__file__).resolve().parent.parent
OUT_IMAGE = ROOT / "apps/platform/public/where-it-shows/page.webp"
OUT_SPOTS = ROOT / "apps/platform/lib/where-it-shows-spots.json"
VIEWPORT = {"width": 1280, "height": 900}
SCALE = 1.5
OUTPUT_WIDTH = 1280
PAD = 12
# Text that only the address row of the page contains; the example business's street name.
ADDRESS_TEXT = "Ghodbunder Road"

Box = dict[str, float]


def union(*boxes: Box) -> Box:
    left = min(b["x"] for b in boxes)
    top = min(b["y"] for b in boxes)
    right = max(b["x"] + b["width"] for b in boxes)
    bottom = max(b["y"] + b["height"] for b in boxes)
    return {"x": left, "y": top, "width": right - left, "height": bottom - top}


def box_of(page: Page, selector: str) -> Box:
    """A selector's box in page (not viewport) coordinates."""
    box = page.locator(selector).first.bounding_box()
    if box is None:
        raise RuntimeError(f"Nothing on the page matches {selector!r}")
    return {**box, "y": box["y"] + page.evaluate("window.scrollY")}


def text_box(page: Page, within: str, text: str) -> Box:
    box = page.locator(within).get_by_text(text).first.bounding_box()
    if box is None:
        raise RuntimeError(f"No {text!r} inside {within!r}")
    return {**box, "y": box["y"] + page.evaluate("window.scrollY")}


def settle(page: Page) -> None:
    """Scroll the whole page once so lazy images load, hide the dev badge, then return to the top."""
    page.add_style_tag(content="nextjs-portal{display:none!important}")
    height = page.evaluate("document.documentElement.scrollHeight")
    for y in range(0, height, 500):
        page.evaluate(f"window.scrollTo(0, {y})")
        page.wait_for_timeout(250)
    page.evaluate("window.scrollTo(0, 0)")
    page.wait_for_timeout(1500)


def spots(page: Page) -> dict[str, Box]:
    """Where each dashboard input shows on the page (as laid out since Services and Products moved beside the page)."""
    # The address and the opening hours are rows of the About card (the page no longer has a Location card).
    address_line = text_box(page, "#about", ADDRESS_TEXT)
    address = {**address_line, "x": address_line["x"] - 36, "width": address_line["width"] + 36}
    hours = box_of(page, "#about details")
    actions = union(text_box(page, "main", "Call Now"), text_box(page, "main", "Share"))
    return {
        "cover-photos": union(*[box_of(page, f"#photos img >> nth={i}") for i in range(page.locator("#photos img").count())]),
        "buttons": {**actions, "x": actions["x"] - 16, "width": actions["width"] + 32, "y": actions["y"] - 8, "height": actions["height"] + 20},
        "about": box_of(page, "#about"),
        "offers": box_of(page, "#offers"),
        # Services and Products are cards in the column beside the page, not full-width sections.
        "services": box_of(page, "#services"),
        "products": box_of(page, "#products"),
        "location": address,
        "hours": {**hours, "x": hours["x"] - 36, "width": hours["width"] + 36},
        "gallery": box_of(page, "#gallery"),
    }


def main() -> None:
    if len(sys.argv) < 2:
        raise SystemExit(__doc__)
    OUT_IMAGE.parent.mkdir(parents=True, exist_ok=True)
    with sync_playwright() as pw:
        browser = pw.chromium.launch(channel="chrome")
        page = browser.new_page(viewport=VIEWPORT, device_scale_factor=SCALE)
        page.goto(sys.argv[1], wait_until="load", timeout=120_000)
        page.wait_for_timeout(4000)
        settle(page)
        found = spots(page)
        png = page.screenshot(full_page=True)
        width, height = page.evaluate("[document.documentElement.scrollWidth, document.documentElement.scrollHeight]")
        browser.close()
    image = Image.open(io.BytesIO(png)).convert("RGB")
    image = image.resize((OUTPUT_WIDTH, round(image.height * OUTPUT_WIDTH / image.width)), Image.LANCZOS)
    image.save(OUT_IMAGE, "WEBP", quality=80, method=6)
    fractions = {
        name: {
            "x": round((box["x"] - PAD) / width, 5),
            "y": round((box["y"] - PAD) / height, 5),
            "w": round((box["width"] + PAD * 2) / width, 5),
            "h": round((box["height"] + PAD * 2) / height, 5),
        }
        for name, box in found.items()
    }
    OUT_SPOTS.write_text(json.dumps({"width": image.width, "height": image.height, "spots": fractions}, indent=2) + "\n")
    print(f"page.webp {image.size} {OUT_IMAGE.stat().st_size // 1024} KB; spots: {', '.join(fractions)}")


if __name__ == "__main__":
    main()
