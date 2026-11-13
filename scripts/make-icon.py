"""App icon + splash for the Mileage Tracker Android app.
Icon: orange rounded square, white rupee sign, 'km/L' below.
Splash: dark background with the same mark centred.
"""
from PIL import Image, ImageDraw, ImageFont
import os

# Paths relative to the project root (this script lives in scripts/).
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES_DIR = os.path.join(ROOT, 'resources')
os.makedirs(RES_DIR, exist_ok=True)

FONT_BOLD = '/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
FONT = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
ORANGE_TOP = (234, 88, 12)      # #EA580C
ORANGE_BOTTOM = (249, 115, 22)  # #F97316
DARK = (11, 18, 32)             # #0B1220
WHITE = (255, 255, 255)


def vgrad(size, top, bottom):
    img = Image.new('RGB', (size, size))
    px = img.load()
    for y in range(size):
        t = y / max(size - 1, 1)
        c = tuple(int(top[i] + (bottom[i] - top[i]) * t) for i in range(3))
        for x in range(size):
            px[x, y] = c
    return img


def rounded_mask(size, radius):
    m = Image.new('L', (size, size), 0)
    d = ImageDraw.Draw(m)
    d.rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def mark(size, bg, square_frac=0.78, rupee_frac=0.42, sub_frac=0.085):
    """Square app mark: orange rounded square on bg, white rupee + km/L."""
    img = Image.new('RGB', (size, size), bg)
    sq = int(size * square_frac)
    off = (size - sq) // 2
    tile = vgrad(sq, ORANGE_TOP, ORANGE_BOTTOM)
    mask = rounded_mask(sq, int(sq * 0.22))
    img.paste(tile, (off, off), mask)
    d = ImageDraw.Draw(img)
    rupee = ImageFont.truetype(FONT_BOLD, int(size * rupee_frac))
    sub = ImageFont.truetype(FONT, int(size * sub_frac))
    # Rupee centred slightly above middle of the square; km/L below it.
    text = '₹'
    bbox = d.textbbox((0, 0), text, font=rupee)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    cx = size // 2 - tw // 2 - bbox[0]
    cy = off + int(sq * 0.47) - th // 2 - bbox[1]
    d.text((cx, cy), text, font=rupee, fill=WHITE)
    sub_text = 'km/L'
    sb = d.textbbox((0, 0), sub_text, font=sub)
    sw, sh = sb[2] - sb[0], sb[3] - sb[1]
    d.text((size // 2 - sw // 2 - sb[0], off + int(sq * 0.80) - sh // 2 - sb[1]),
           sub_text, font=sub, fill=(255, 255, 255))
    return img


icon = mark(1024, ORANGE_BOTTOM, square_frac=1.0, rupee_frac=0.46, sub_frac=0.09)
icon.save(os.path.join(RES_DIR, 'icon.png'))
# Icon is full-bleed orange (Android masks the shape); no transparency needed.

splash = mark(2732, DARK, square_frac=0.34, rupee_frac=0.185, sub_frac=0.038)
splash.save(os.path.join(RES_DIR, 'splash.png'))
print('icon.png + splash.png written')
