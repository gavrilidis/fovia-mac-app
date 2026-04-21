#!/usr/bin/env python3
"""
Regenerate DMG installer assets:

    * faceflow-client/src-tauri/icons/dmg-background.png       (660x480, 1x)
    * faceflow-client/src-tauri/icons/dmg-background@2x.png    (1320x960, 2x)
    * faceflow-client/src-tauri/icons/How to open FaceFlow.pdf (US Letter, 2-page)

All assets are drawn at 2x (retina) resolution internally and either
downsampled (for the 1x PNG) or saved directly (for the 2x PNG / PDF)
so every pixel is crisp on modern displays.

The DMG window layout this script targets:

    Window  : 660 x 480 logical
    Row 1   : FaceFlow.app icon at (180,170)  +  Applications alias at (480,170)
    Row 2   : "How to open FaceFlow.pdf" at (330,360)

Usage:
    python3 scripts/make_dmg_assets.py
"""

from __future__ import annotations

import sys
from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter, ImageFont

REPO_ROOT = Path(__file__).resolve().parents[1]
ICONS_DIR = REPO_ROOT / "faceflow-client" / "src-tauri" / "icons"
BG_1X = ICONS_DIR / "dmg-background.png"
BG_2X = ICONS_DIR / "dmg-background@2x.png"
PDF_OUT = ICONS_DIR / "How to open FaceFlow.pdf"

# ──────────────────────────────────────────────────────────────────────
# Font loading — prefer Inter / SF Pro if available, fall back to system
# Helvetica. All sizes below are given at 2x.
# ──────────────────────────────────────────────────────────────────────
FONT_CANDIDATES = [
    "/System/Library/Fonts/SFNS.ttf",
    "/System/Library/Fonts/SFNSDisplay.ttf",
    "/System/Library/Fonts/Supplemental/Arial.ttf",
    "/Library/Fonts/Arial.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
]
BOLD_FONT_CANDIDATES = [
    "/System/Library/Fonts/SFNSRounded.ttf",
    "/System/Library/Fonts/Supplemental/Arial Bold.ttf",
    "/Library/Fonts/Arial Bold.ttf",
    "/System/Library/Fonts/HelveticaNeue.ttc",
]


def _load_font(size: int, bold: bool = False) -> ImageFont.FreeTypeFont:
    candidates = BOLD_FONT_CANDIDATES if bold else FONT_CANDIDATES
    for path in candidates:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size=size)
            except OSError:
                continue
    return ImageFont.load_default()


# ──────────────────────────────────────────────────────────────────────
# Background rendering
# ──────────────────────────────────────────────────────────────────────
W, H = 660, 480  # logical
SCALE = 2  # retina
WP, HP = W * SCALE, H * SCALE  # pixel dimensions of 2x canvas

BG_TOP = (30, 32, 40)  # deep graphite
BG_BOTTOM = (18, 19, 24)
ACCENT = (46, 169, 255)  # faceflow accent (cyan-blue)
TEXT_PRIMARY = (240, 242, 248)
TEXT_MUTED = (150, 158, 174)
ARROW_COLOR = (120, 200, 255)


def _vertical_gradient(
    size: tuple[int, int], top: tuple[int, int, int], bottom: tuple[int, int, int]
) -> Image.Image:
    img = Image.new("RGB", size, top)
    px = img.load()
    assert px is not None
    w, h = size
    for y in range(h):
        t = y / max(h - 1, 1)
        r = int(top[0] + (bottom[0] - top[0]) * t)
        g = int(top[1] + (bottom[1] - top[1]) * t)
        b = int(top[2] + (bottom[2] - top[2]) * t)
        for x in range(w):
            px[x, y] = (r, g, b)
    return img


def _radial_glow(
    size: tuple[int, int],
    center: tuple[int, int],
    radius: int,
    color: tuple[int, int, int, int],
) -> Image.Image:
    glow = Image.new("RGBA", size, (0, 0, 0, 0))
    d = ImageDraw.Draw(glow)
    cx, cy = center
    d.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=color)
    return glow.filter(ImageFilter.GaussianBlur(radius // 3))


def _draw_arrow(
    draw: ImageDraw.ImageDraw, x1: int, x2: int, y: int, color: tuple[int, int, int]
) -> None:
    """
    Draw a clean horizontal "drag me" arrow at 2x.
    x1, x2, y are in *2x pixel* coordinates.

    Design: a thin stroke with a proper tapered arrowhead. The head
    is drawn as a filled triangle with a slight shadow; the tail is
    offset so the triangle base doesn't look detached.
    """
    stroke_w = 5  # thin, elegant
    head_w = 28  # arrowhead base width
    head_h = 34  # arrowhead length

    # Shadow behind the shaft for depth
    shadow_offset = 2
    draw.line(
        [(x1, y + shadow_offset), (x2 - head_h + 2, y + shadow_offset)],
        fill=(0, 0, 0, 90),
        width=stroke_w + 2,
    )
    # Main shaft — stops where the arrowhead begins so the tip is pointed.
    draw.line(
        [(x1, y), (x2 - head_h + 2, y)],
        fill=color,
        width=stroke_w,
    )
    # Arrowhead — equilateral-ish triangle pointing right.
    tri = [
        (x2, y),  # tip
        (x2 - head_h, y - head_w // 2),  # upper base
        (x2 - head_h, y + head_w // 2),  # lower base
    ]
    # Soft shadow under the head.
    shadow = [(x, y_ + shadow_offset) for x, y_ in tri]
    draw.polygon(shadow, fill=(0, 0, 0, 90))
    draw.polygon(tri, fill=color)


def _text_centered(
    draw: ImageDraw.ImageDraw,
    cx: int,
    cy: int,
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
) -> None:
    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    draw.text(
        (cx - (right - left) // 2 - left, cy - (bottom - top) // 2 - top),
        text,
        font=font,
        fill=fill,
    )


def render_background_2x() -> Image.Image:
    img = _vertical_gradient((WP, HP), BG_TOP, BG_BOTTOM)
    img = img.convert("RGBA")

    # Subtle radial glows behind each icon slot — adds polish without noise.
    glow_left = _radial_glow(
        (WP, HP), (180 * SCALE, 170 * SCALE), 210 * SCALE, (46, 169, 255, 40)
    )
    glow_right = _radial_glow(
        (WP, HP), (480 * SCALE, 170 * SCALE), 210 * SCALE, (46, 169, 255, 40)
    )
    img.alpha_composite(glow_left)
    img.alpha_composite(glow_right)

    draw = ImageDraw.Draw(img, "RGBA")

    # Title: "Install FaceFlow"
    title_font = _load_font(44 * SCALE // 2, bold=True)  # 44pt logical
    subtitle_font = _load_font(14 * SCALE, bold=False)
    _text_centered(
        draw, WP // 2, 56 * SCALE, "Install FaceFlow", title_font, TEXT_PRIMARY
    )
    _text_centered(
        draw,
        WP // 2,
        92 * SCALE,
        "Drag the app onto Applications to install",
        subtitle_font,
        TEXT_MUTED,
    )

    # Arrow between the two icon slots. Icon slots are 128px wide logical
    # (Finder default for DMG icon view at 88pt). We want the arrow to
    # start just right of the left icon and end just before the right.
    _draw_arrow(
        draw,
        x1=(180 + 60) * SCALE,  # just right of FaceFlow.app icon
        x2=(480 - 60) * SCALE,  # just left of Applications icon
        y=170 * SCALE,
        color=ARROW_COLOR,
    )

    # Separator + hint above the PDF spot
    hint_font = _load_font(12 * SCALE, bold=False)
    # thin divider
    draw.line(
        [(170 * SCALE, 290 * SCALE), (490 * SCALE, 290 * SCALE)],
        fill=(255, 255, 255, 30),
        width=1,
    )
    _text_centered(
        draw,
        WP // 2,
        310 * SCALE,
        "FIRST LAUNCH ON macOS — READ ME FIRST",
        hint_font,
        TEXT_MUTED,
    )

    # Small down-chevron guiding the eye to the PDF icon below
    cx = WP // 2
    cy = 340 * SCALE
    chev = [
        (cx - 10 * SCALE, cy - 4 * SCALE),
        (cx, cy + 6 * SCALE),
        (cx + 10 * SCALE, cy - 4 * SCALE),
    ]
    draw.line([chev[0], chev[1]], fill=(120, 200, 255, 180), width=3)
    draw.line([chev[1], chev[2]], fill=(120, 200, 255, 180), width=3)

    return img


def write_backgrounds() -> None:
    img_2x = render_background_2x()
    img_2x.convert("RGB").save(BG_2X, "PNG", optimize=True)

    # 1x: downsample the 2x render with high-quality LANCZOS so the
    # non-retina path also looks clean.
    img_1x = img_2x.resize((W, H), Image.LANCZOS).convert("RGB")
    img_1x.save(BG_1X, "PNG", optimize=True)

    print(f"Wrote {BG_1X.relative_to(REPO_ROOT)}  ({W}x{H})")
    print(f"Wrote {BG_2X.relative_to(REPO_ROOT)}  ({WP}x{HP})")


# ──────────────────────────────────────────────────────────────────────
# "How to open FaceFlow.pdf" — generated as a page-sized PIL image and
# saved as a PDF. Rendered at 2x so the text stays crisp when the user
# zooms in Preview.
# ──────────────────────────────────────────────────────────────────────
PAGE_W, PAGE_H = 612, 792  # US Letter at 72dpi
PDF_SCALE = 3  # render at 3x for sharpness
PWP, PHP = PAGE_W * PDF_SCALE, PAGE_H * PDF_SCALE

PDF_BG = (252, 252, 253)
PDF_TITLE = (18, 20, 28)
PDF_BODY = (55, 60, 75)
PDF_ACCENT = (46, 169, 255)
PDF_CARD = (244, 247, 252)
PDF_BORDER = (222, 228, 238)


def _rounded_rect(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int, int, int],
    radius: int,
    fill: tuple[int, int, int],
    outline: tuple[int, int, int] | None = None,
    width: int = 1,
) -> None:
    x0, y0, x1, y1 = xy
    draw.rounded_rectangle(
        (x0, y0, x1, y1), radius=radius, fill=fill, outline=outline, width=width
    )


def _draw_step(
    draw: ImageDraw.ImageDraw,
    x: int,
    y: int,
    w: int,
    number: int,
    title: str,
    body_lines: list[str],
    font_num: ImageFont.FreeTypeFont,
    font_title: ImageFont.FreeTypeFont,
    font_body: ImageFont.FreeTypeFont,
) -> int:
    """Draw a numbered step card. Returns the y-coordinate of its bottom."""
    pad = 20 * PDF_SCALE
    badge_r = 18 * PDF_SCALE
    line_h = 20 * PDF_SCALE

    card_h = pad * 2 + (len(body_lines) + 1) * line_h + 10 * PDF_SCALE
    _rounded_rect(
        draw,
        (x, y, x + w, y + card_h),
        radius=14 * PDF_SCALE,
        fill=PDF_CARD,
        outline=PDF_BORDER,
        width=1,
    )
    # Number badge
    bx = x + pad + badge_r
    by = y + pad + badge_r
    draw.ellipse(
        (bx - badge_r, by - badge_r, bx + badge_r, by + badge_r), fill=PDF_ACCENT
    )
    num_s = str(number)
    l, t, r, b = draw.textbbox((0, 0), num_s, font=font_num)
    draw.text(
        (bx - (r - l) // 2 - l, by - (b - t) // 2 - t),
        num_s,
        font=font_num,
        fill=(255, 255, 255),
    )

    # Title + body
    tx = bx + badge_r + 14 * PDF_SCALE
    ty = y + pad
    draw.text((tx, ty), title, font=font_title, fill=PDF_TITLE)
    cy = ty + int(line_h * 1.3)
    for line in body_lines:
        draw.text((tx, cy), line, font=font_body, fill=PDF_BODY)
        cy += line_h

    return y + card_h


def render_pdf() -> None:
    img = Image.new("RGB", (PWP, PHP), PDF_BG)
    draw = ImageDraw.Draw(img)

    font_hero = _load_font(32 * PDF_SCALE, bold=True)
    font_sub = _load_font(14 * PDF_SCALE, bold=False)
    font_step_num = _load_font(18 * PDF_SCALE, bold=True)
    font_step_title = _load_font(17 * PDF_SCALE, bold=True)
    font_step_body = _load_font(13 * PDF_SCALE, bold=False)
    font_footer = _load_font(11 * PDF_SCALE, bold=False)

    margin_x = 56 * PDF_SCALE
    cursor_y = 56 * PDF_SCALE

    # Header accent bar
    draw.rectangle(
        (margin_x, cursor_y, margin_x + 60 * PDF_SCALE, cursor_y + 4 * PDF_SCALE),
        fill=PDF_ACCENT,
    )
    cursor_y += 24 * PDF_SCALE

    # Title + subtitle
    draw.text(
        (margin_x, cursor_y), "How to open FaceFlow", font=font_hero, fill=PDF_TITLE
    )
    cursor_y += 44 * PDF_SCALE
    draw.text(
        (margin_x, cursor_y),
        "macOS blocks apps from unidentified developers by default. Choose any one of",
        font=font_sub,
        fill=PDF_BODY,
    )
    cursor_y += 18 * PDF_SCALE
    draw.text(
        (margin_x, cursor_y),
        "these three methods to allow FaceFlow to launch. You only need to do this once.",
        font=font_sub,
        fill=PDF_BODY,
    )
    cursor_y += 36 * PDF_SCALE

    card_w = PWP - margin_x * 2

    # Step 1 — Right-click → Open
    cursor_y = _draw_step(
        draw,
        margin_x,
        cursor_y,
        card_w,
        1,
        "Right-click → Open  (recommended)",
        [
            "• Open the Applications folder in Finder.",
            "• Right-click (or Control-click) FaceFlow.",
            "• Choose Open, then click Open in the warning dialog.",
        ],
        font_step_num,
        font_step_title,
        font_step_body,
    )
    cursor_y += 16 * PDF_SCALE

    # Step 2 — System Settings → Privacy & Security
    cursor_y = _draw_step(
        draw,
        margin_x,
        cursor_y,
        card_w,
        2,
        "System Settings → Privacy & Security",
        [
            "• Try to launch FaceFlow once (macOS will block it).",
            "• Open System Settings → Privacy & Security.",
            "• Scroll down and click Open Anyway next to FaceFlow.",
        ],
        font_step_num,
        font_step_title,
        font_step_body,
    )
    cursor_y += 16 * PDF_SCALE

    # Step 3 — Terminal (power users)
    cursor_y = _draw_step(
        draw,
        margin_x,
        cursor_y,
        card_w,
        3,
        "Terminal  (power users)",
        [
            "• Open the Terminal app.",
            "• Paste this command and press Return:",
            "    xattr -dr com.apple.quarantine /Applications/FaceFlow.app",
            "• Launch FaceFlow normally after the command completes.",
        ],
        font_step_num,
        font_step_title,
        font_step_body,
    )
    cursor_y += 28 * PDF_SCALE

    # Footer
    draw.text(
        (margin_x, PHP - 70 * PDF_SCALE),
        "FaceFlow — photo management built for professionals.",
        font=font_footer,
        fill=(140, 148, 166),
    )
    draw.text(
        (margin_x, PHP - 52 * PDF_SCALE),
        "Questions?  support@faceflow.app",
        font=font_footer,
        fill=(140, 148, 166),
    )

    # Save as image-based PDF. PIL embeds the image directly — file size
    # stays small because PDF image compression is efficient.
    img.save(PDF_OUT, "PDF", resolution=72.0 * PDF_SCALE)
    print(f"Wrote {PDF_OUT.relative_to(REPO_ROOT)}")


def main() -> int:
    ICONS_DIR.mkdir(parents=True, exist_ok=True)
    write_backgrounds()
    render_pdf()
    return 0


if __name__ == "__main__":
    sys.exit(main())
