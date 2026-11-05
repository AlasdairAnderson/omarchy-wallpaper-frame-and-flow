#!/usr/bin/env python3
"""Wallpaper discovery and slideshow rotation for Frame And Flow."""
import json
import os
from pathlib import Path
import subprocess
import sys

EXTENSIONS = {'.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp',
              '.mp4', '.m4v', '.mov', '.webm', '.mkv', '.avi'}


def context():
    home = Path.home()
    state = home / '.local/state/omarchy/current'
    try:
        theme = (state / 'theme.name').read_text().strip()
    except OSError:
        theme = ''
    directories = [state / 'theme/backgrounds']
    if theme and theme not in ('.', '..') and '/' not in theme and '\n' not in theme:
        directories.append(home / '.config/omarchy/backgrounds' / theme)
    link = state / 'background'
    selected = os.path.realpath(link) if link.exists() else ''
    return directories, selected


def wallpapers(directories):
    paths = []
    for directory in directories:
        try:
            paths.extend(p for p in directory.iterdir()
                         if p.is_file() and p.suffix.lower() in EXTENSIONS)
        except OSError:
            continue
    # Match the picker's sorted rows and filename deduplication. User images
    # under .config sort before stock images under .local/state.
    seen = set()
    result = []
    for image in sorted(paths):
        if image.name not in seen:
            seen.add(image.name)
            result.append(image)
    return result


def main():
    directories, selected = context()
    if sys.argv[1:] == ['--next']:
        images = wallpapers(directories)
        if not images:
            return
        # Omarchy's current-background link resolves through theme symlinks.
        # Compare resolved paths so each tick advances instead of picking the
        # first image repeatedly.
        index = next((i for i, image in enumerate(images)
                      if str(image.resolve()) == selected), -1)
        image = images[(index + 1) % len(images)].resolve()
        subprocess.run(['omarchy-theme-bg-set', str(image)], check=True)
    elif not sys.argv[1:]:
        print(json.dumps({'imageDirs': '\n'.join(map(str, directories)),
                          'selectedImage': selected}))
    else:
        raise SystemExit('Usage: backgrounds.py [--next]')


if __name__ == '__main__':
    main()
