# Wallpaper Frame And Flow for Omarchy

An enhanced, retro-styled wallpaper and image picker overlay for [Omarchy](https://omarchy.org/) with interactive stepped horizontal alignment controls, background slideshow timer configuration, and persistent settings.

![Alignment Drawer Preview](https://raw.githubusercontent.com/AlasdairAnderson/omarchy/screenshots/background-alignment/background-alignment-preview.png)

## Features

- **Stepped Horizontal Alignment**: Anchor wide or panoramic wallpapers to your preferred framing with 5 stepped positions:
  - `⇤ Left (0%)`
  - `↼ 25% (Mid-L)`
  - `↔ Center (50%)`
  - `⇁ 75% (Mid-R)`
  - `⇥ Right (100%)`
- **Background Slideshow Timer**: Configure timed rotation intervals directly within the picker:
  - `✕ Off (Disabled)`
  - `⏱ 1m (Test)`
  - `⏱ 5m (Fast)`
  - `⏱ 15m (Default)`
  - `⏱ 30m (Steady)`
  - `⏱ 1h (Slow)`
- **Retro Dual-Tab Drawer**:
  - `[A] Align` and `[T] Transition` tabs docked directly beneath the preview card
  - Matching 3px border stroke width and collinear slanted geometry
  - Translucent background with crisp theme-aware styling
- **Persistent Status Shelf**:
  - Displays wallpaper index counter (`[1/10]`), wallpaper label, active alignment, and transition interval at all times (both collapsed and expanded)
- **Session Persistence**:
  - Alignments saved per background in `~/.config/omarchy/background-alignments.json`
  - Slideshow settings saved in `~/.config/omarchy/background-slideshow.json`

## Screenshots

### Stepped Alignment Drawer (`[A] Align`)
![Stepped Alignment Drawer](https://raw.githubusercontent.com/AlasdairAnderson/omarchy/screenshots/background-alignment/background-alignment-preview.png)

### Slideshow Transition Drawer (`[T] Transition`)
![Slideshow Transition Drawer](https://raw.githubusercontent.com/AlasdairAnderson/omarchy/screenshots/background-alignment/background-transition-preview.png)

### Persistent Status Shelf (Collapsed)
![Collapsed Status Shelf](https://raw.githubusercontent.com/AlasdairAnderson/omarchy/screenshots/background-alignment/background-collapsed-preview.png)

## Dependencies & Requirements

- **Omarchy**: Standard installation running `omarchy-shell` (Quickshell).
- **ffmpegthumbnailer** *(optional)*: Required only if you use animated video wallpapers (`.mp4`, `.webm`, `.mkv`, etc.) for generating thumbnail previews. Standard image formats (`.png`, `.jpg`, `.webp`, `.gif`, `.bmp`) require no extra dependencies.

## Installation & Removal

### Install & Enable
Install and enable the plugin with a single Omarchy command:

```bash
omarchy plugin add https://github.com/AlasdairAnderson/omarchy-wallpaper-frame-and-flow.git --enable
```

### Update
To update to the latest release:

```bash
omarchy plugin update alasdairanderson.wallpaper-frame-and-flow
```

### Disable or Remove
To temporarily disable without uninstalling:

```bash
omarchy plugin disable alasdairanderson.wallpaper-frame-and-flow
```

To completely remove the plugin and restore the default image picker:

```bash
omarchy plugin remove alasdairanderson.wallpaper-frame-and-flow
```

## Controls & Shortcuts

| Key / Action | Description |
|---|---|
| <kbd>Left</kbd> / <kbd>Right</kbd> | Navigate wallpapers in the carousel |
| <kbd>A</kbd> | Toggle the `[A] Align` drawer |
| <kbd>T</kbd> | Toggle the `[T] Transition` drawer |
| <kbd>Up</kbd> / <kbd>Down</kbd> | Step through options in the active drawer |
| <kbd>Enter</kbd> | Apply the selected wallpaper and active alignment |
| <kbd>Escape</kbd> | Close the active drawer or dismiss the picker |
| **Mouse Click** | Click any tab or option button directly |

## License

[MIT](LICENSE) © 2026 Alasdair Anderson
