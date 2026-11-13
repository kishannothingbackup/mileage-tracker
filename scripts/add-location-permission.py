"""Add the location permissions to the generated Android manifest.

`npx cap add android` regenerates android/ from scratch, and the
@capacitor/geolocation plugin does NOT declare the permissions in its
own manifest — its README says to add them to AndroidManifest.xml
manually. This script does that insertion (idempotently) so CI can run
it right after `cap add android` and before the Gradle build.

Usage: python3 scripts/add-location-permission.py
"""
import sys
from pathlib import Path

MANIFEST = Path(__file__).resolve().parent.parent / 'android' / 'app' / 'src' / 'main' / 'AndroidManifest.xml'

PERMISSIONS = (
    '    <!-- Geolocation plugin: location permission prompt -->\n'
    '    <uses-permission android:name="android.permission.ACCESS_COARSE_LOCATION" />\n'
    '    <uses-permission android:name="android.permission.ACCESS_FINE_LOCATION" />\n'
)


def main():
    if not MANIFEST.exists():
        print(f'AndroidManifest.xml not found at {MANIFEST} — run `npx cap add android` first.')
        return 1
    text = MANIFEST.read_text(encoding='utf-8')
    if 'ACCESS_FINE_LOCATION' in text:
        print('Location permissions already present, nothing to do.')
        return 0
    # <uses-permission> elements live directly under <manifest>, before <application>.
    marker = '<application'
    if marker in text:
        text = text.replace(marker, PERMISSIONS + marker, 1)
    else:
        text = text.replace('</manifest>', PERMISSIONS + '</manifest>', 1)
    MANIFEST.write_text(text, encoding='utf-8')
    print('Added ACCESS_COARSE_LOCATION + ACCESS_FINE_LOCATION to AndroidManifest.xml.')
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
