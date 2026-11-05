# Wallpaper Frame And Flow for Omarchy

A retro wallpaper picker with five horizontal framing positions and an automatic slideshow. Version 1.1 bundles the desktop renderer, settings, and rotation timer in one plugin for Omarchy 4.5.

![Alignment Drawer Preview](preview.png)

## How it fits into Omarchy

Frame And Flow replaces **`omarchy.background`**, the desktop background service. Its own overlay opens under `alasdairanderson.wallpaper-frame-and-flow`. It retains `omarchy.image-picker` for Omarchy's native theme picker.

- Double-click the desktop with the **left** button to open Frame And Flow.
- Double-click with the **right** button to open Omarchy's native theme picker.
- Open the enhanced picker from a terminal or a custom keybinding with:

  ```bash
  omarchy-shell shell summon alasdairanderson.wallpaper-frame-and-flow
  ```

**Unified access needs an upstream Omarchy extension.** Stock Omarchy 4.5 has no supported plugin-owned menu routing lifecycle. Its existing background shortcuts/menu retain native behavior; they do not open Frame And Flow. Use left desktop double-click or the command above for the visible **Align** and **Transition** controls.

The project includes a [tested upstream proposal](upstream/README.md) to route all current-theme background requests through the enabled plugin:

| Access | With proposed upstream support | Stock Omarchy 4.5 |
|---|---|---|
| Super + Ctrl + Space | Frame And Flow | Native background action |
| Super + Ctrl + W | Frame And Flow | Native background action |
| Appearance → Background | Frame And Flow | Native background action |
| Menu aliases `background` and `wallpaper` | Frame And Flow | Native background action |
| Left desktop double-click | Frame And Flow | Frame And Flow |
| Theme shortcuts and right desktop double-click | Native theme picker | Native theme picker |

The manifest opts into the proposed `omarchy.backgroundPicker` API; stock 4.5 ignores that field. The upstream patch is a review artifact and is not installed or applied by this plugin. Once Omarchy ships the API, disabling/removing Frame And Flow restores native background routing using the existing clone lifecycle. Explicit user menu actions and shortcut overrides retain priority. No user menu or keybinding files are rewritten.

The plugin preserves Omarchy 4.5's background IPC, theme transitions, monitor handling, image recovery, and OWE video handoff. Video playback is handled by Omarchy; horizontal alignment applies to still images. The slideshow controls remain available when a video is selected.

## Features

- **Alignment:** left, 25%, center, 75%, and right. The preview and desktop use the same position; each wallpaper remembers its setting.
- **Slideshow:** off, 10 seconds, 5 minutes, 15 minutes, 30 minutes, or 1 hour. Changes take effect immediately and survive shell restarts.
- **Current-theme discovery:** both stock backgrounds and user backgrounds in `~/.config/omarchy/backgrounds/<theme>/`. Rotation advances through symlinked theme directories and wraps at the end.
- **One installation:** no separate `kingbooty.background` plugin, slideshow service, or custom commands in `~/.local/bin` are required.
- **Theme-aware appearance:** colors and motion follow the shell theme and animation setting.

Settings remain compatible with earlier versions:

- `~/.config/omarchy/background-alignments.json`
- `~/.config/omarchy/background-slideshow.json`

The slideshow starts disabled when no settings exist. It skips ticks while Frame And Flow's picker is open or a previous rotation is still running. Disabling the plugin stops its timer and restores the native background service through Omarchy's clone lifecycle; saved settings remain on disk.

## Requirements

- **Omarchy 4.5** with `omarchy-shell` (Quickshell), Python 3, and ImageMagick, provided by a standard installation.
- **ffmpegthumbnailer** for video thumbnail previews.
- Omarchy's **OWE** integration for video wallpaper playback.

## Install

```bash
omarchy plugin add https://github.com/AlasdairAnderson/omarchy-wallpaper-frame-and-flow.git --enable
```

If another background replacement is enabled, restore the native background service before enabling Frame And Flow, so only one renderer owns the desktop:

```bash
omarchy plugin enable omarchy.background
omarchy plugin enable alasdairanderson.wallpaper-frame-and-flow
```

## Optional hotkeys on stock Omarchy 4.5

You can manually assign **Super + Ctrl + Space** and **Super + Ctrl + W** to Frame And Flow without the proposed upstream extension. This is an optional user configuration change; the plugin does not install or manage these overrides. It changes only the two shortcuts, leaving the Background menu and theme selection as they are.

Install and enable the plugin first, then inspect your current shortcuts:

```bash
omarchy menu keybindings --print
```

Both shortcuts normally open Omarchy's native background switcher. Back up `~/.config/hypr/bindings.lua`, and add the following lines to that file. If it already contains overrides for these keys, save those original lines and replace only the matching overrides. Keep all other bindings.

```lua
o.rebind("SUPER + CTRL + SPACE", "Frame And Flow", "omarchy-shell shell summon alasdairanderson.wallpaper-frame-and-flow")
o.rebind("SUPER + CTRL + W", "Frame And Flow", "omarchy-shell shell summon alasdairanderson.wallpaper-frame-and-flow")
```

`o.rebind` replaces the existing binding for each key, preventing duplicate actions. Save the file, then reload and check for errors:

```bash
hyprctl reload
hyprctl configerrors
```

Press each shortcut to check that Frame And Flow opens with **Align** and **Transition** visible. Close it with Escape between checks. The theme shortcuts, **Super + Ctrl + T** and **Super + Ctrl + Shift + Space**, continue to open the native theme picker.

**Before disabling or removing the plugin**, remove these two lines and restore any previous user overrides you replaced. If there were no previous user overrides, removing the lines restores Omarchy's default background shortcuts when you reload. Run `hyprctl reload` and `hyprctl configerrors` again. Keep any unrelated edits made since the backup; do not overwrite the entire bindings file to undo this setup.

Manual bindings remain after plugin disable/removal and cannot open a disabled or missing plugin. Automatic routing and restoration for all entry points still require the proposed upstream API.

## Upgrade from 1.0

Version 1.0 replaced the shared image picker. Disable it **before updating**, while Omarchy can still read the old manifest and restore that source. Once the 1.1 changes are available from the remote repository:

```bash
omarchy plugin disable alasdairanderson.wallpaper-frame-and-flow
omarchy plugin update alasdairanderson.wallpaper-frame-and-flow
omarchy plugin enable omarchy.image-picker
omarchy plugin enable omarchy.background
omarchy plugin enable alasdairanderson.wallpaper-frame-and-flow
omarchy restart shell
```

These commands also restore the native image picker if the manifest was updated before disabling 1.0. Enabling the native background service first deactivates a previous background clone, including the old separate alignment/slideshow renderer. Existing settings are reused by the bundled service.

For subsequent updates:

```bash
omarchy plugin update alasdairanderson.wallpaper-frame-and-flow
omarchy restart shell
```

The restart reloads the plugin's keep-loaded service code.

## Unified-access migration

There is no safe plugin-only migration for stock 4.5. Update Omarchy to a release containing the proposed background-picker API before expecting the unified shortcuts/menu behavior, then update Frame And Flow and restart the shell as above. The first supported Omarchy release is not yet known.

Stock menus/bindings need no edits. If you previously added manual overrides, review only those Background actions and shortcut lines, including legacy `style.background` aliases, and remove them only if they belong to that old integration. Keep unrelated extensions, comments and keybindings. Do not replace entire configuration files or patch the installed Omarchy package. See the [proposal and validation status](upstream/README.md) for details.

## Disable or remove

```bash
omarchy plugin disable alasdairanderson.wallpaper-frame-and-flow
# Or:
omarchy plugin remove alasdairanderson.wallpaper-frame-and-flow
```

## Controls

| Key / action | Description |
|---|---|
| Left / Right | Navigate wallpapers |
| A | Toggle the alignment drawer (still images) |
| T | Toggle the slideshow interval drawer |
| Tab | Switch drawer tabs, or navigate when the drawer is closed |
| Up / Down | Change the active drawer's option |
| Enter | Apply the selected wallpaper and alignment |
| Escape | Close the active drawer or dismiss the picker |
| Mouse | Select wallpapers, tabs, and options |

Slideshow interval changes save immediately. Wallpaper and alignment changes apply with Enter or a click on the selected preview. An application failure keeps the picker open for retry.

## Development checks

```bash
node --test --test-isolation=none tests/compatibility.test.cjs tests/omarchy-routing.test.cjs
bash -n ipc-file.sh list.sh tests/qml-smoke.sh
omarchy plugin validate .
# Requires access to a running Wayland session; uses isolated state in /tmp.
bash tests/qml-smoke.sh
```

The smoke test compiles and instantiates the picker closed and renderer suspended; it does not install the plugin or change desktop settings. The regression tests exercise theme routing, direct application, safe file-based IPC, crop geometry, configuration limits, and real slideshow rotation through temporary fixtures.

The Omarchy routing tests require installed 4.5 sources (`OMARCHY_PATH`, default `/usr/share/omarchy`); they skip when unavailable. They test the actual registry and CLI lifecycle in an isolated HOME, preserve unrelated user-file fixtures, and apply the proposed upstream patch only to temporary source copies. Passing these tests does not certify unified access on the unmodified installed shell; the remaining graphical checks are listed in the proposal.

## License

[MIT](LICENSE) © 2026 Alasdair Anderson. The bundled background service is adapted from Omarchy 4.5.0; its upstream license is included in [LICENSE.omarchy](LICENSE.omarchy).
