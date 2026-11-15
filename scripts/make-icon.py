"""App icon + splash for the Petra Android app.

Both come from Kishan's logo (src/assets/petra-logo.b64 — base64 text, not a
binary file, because the GitHub snapshot-push procedure rejects non-UTF-8
files). The logo is a black rounded-square tile with a cream "P".

Icon: the logo resized to 1024x1024 (Android masks the shape; full-bleed is
fine — the previous icon was full-bleed orange the same way).
Splash: the logo full-bleed at 2732x2732.
"""
import base64
import io
import os

from PIL import Image

# Paths relative to the project root (this script lives in scripts/).
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
RES_DIR = os.path.join(ROOT, 'resources')
LOGO_B64 = os.path.join(ROOT, 'src', 'assets', 'petra-logo.b64')
os.makedirs(RES_DIR, exist_ok=True)

with open(LOGO_B64, 'r', encoding='utf-8') as f:
    logo = Image.open(io.BytesIO(base64.b64decode(f.read()))).convert('RGB')

icon = logo.resize((1024, 1024), Image.LANCZOS)
icon.save(os.path.join(RES_DIR, 'icon.png'))

splash = logo.resize((2732, 2732), Image.LANCZOS)
splash.save(os.path.join(RES_DIR, 'splash.png'))
print('icon.png + splash.png written from Petra logo')
