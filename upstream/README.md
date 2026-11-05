# Proposal: an owned background-picker route

Status: draft, tested against the installed **Omarchy 4.5.0-3** sources. This is
an upstream contribution artifact, not an installer or a patch applied to the
user's system. Stock 4.5 does not implement this API. No upstream submission
has been made.

## Why an upstream change is required

The supported mechanisms inspected were:

- `shell/plugins/README.md`: third-party overlays/services and native image-picker IPC.
- `shell/services/PluginRegistry.qml`: `clonedFrom`, `resolveEnabledId`, `setEnabled`, and source restoration.
- `shell/services/PluginShellApi.qml`: capability-scoped plugin calls; no menu registration API.
- `config/omarchy/extensions/omarchy-menu.jsonc`: the supported user-owned menu override file.
- `shell/plugins/menu/Menu.qml` and `MenuModel.js`: defaults plus user JSONC,
  with field overrides and alias resolution; no enabled-plugin contribution source.
- `bin/omarchy-plugin-{add,enable,disable,remove}`: no plugin install/disable/uninstall scripts.
- `default/hypr/bindings/utilities.lua`: both background shortcuts already request `background`.

Upstream's [plugin documentation](https://github.com/omacom/omarchy/blob/quattro/shell/plugins/README.md)
also describes these plugin and user-menu surfaces. The installed package is
the reference for the version-specific findings above.

A user menu override can change the Background action, but remains after plugin
disable/removal. Replacing the shared image picker would also intercept theme
selection. Rebinding keys misses menu callers and introduces separate restoration
state. None meets this project's lifecycle requirements.

## Smallest proposed extension

The [patch](omarchy-4.5-background-picker.patch) changes three upstream files:

1. Add `PluginRegistry.backgroundPickerId()`. Only the active, enabled clone of
   `omarchy.background` may opt in, with `omarchy.backgroundPicker: true` and a
   safe overlay entry point. This uses the existing single-renderer lifecycle;
   it does not invent a second provider selection setting.
2. Add `omarchy-shell shell selectBackground`. Resolve the provider on each
   request and summon its overlay with `{}`. Without a provider, or if summon
   refuses the request, run the existing native background selection/apply
   command unchanged. The native picker continues to include stock and user
   backgrounds for the current theme.
3. Change only the default `appearance.background.action` to that shell method.
   Existing aliases and keybindings continue to use that row. Theme selection
   keeps its existing native image-picker action.

Frame and Flow's manifest declares the proposed flag. Stock Omarchy ignores it;
it grants no additional shell capabilities. Its renderer already directs left
double-click to its own picker and right double-click to native theme selection.
No change to Omarchy's native desktop renderer is needed: once Frame and Flow
is disabled, the native renderer and its original desktop behavior return.

No user menu/keybinding files are written. No lifecycle scripts, PATH wrappers,
polling services, global image-selector replacement, or packaged file edits are
installed. Omarchy itself must ship the extension before unified access works.

Explicit user Background action overrides continue to take precedence. They
must not be silently overwritten to force routing. User keybindings that
deliberately replace the stock shortcuts likewise retain their actions.

## Access contract

| Access | With the proposed API and Frame and Flow enabled | Disabled/removed |
|---|---|---|
| Super + Ctrl + Space | Frame and Flow | Native background selection |
| Super + Ctrl + W | Frame and Flow | Native background selection |
| Appearance → Background | Frame and Flow | Native background selection |
| `background` / `wallpaper` menu aliases | Frame and Flow | Native background selection |
| Left desktop double-click | Frame and Flow | Native background selection |
| Theme shortcuts | Native theme picker | Native theme picker |
| Right desktop double-click | Native theme picker | Native theme picker |

The table assumes stock routes rather than explicit user overrides. Alignment
and slideshow settings survive disable/removal. A native renderer that was
already deliberately disabled remains disabled, following Omarchy's existing
restoration rules.

## Validation and limits

Run from the Frame and Flow repository:

```bash
node --test --test-isolation=none tests/compatibility.test.cjs tests/omarchy-routing.test.cjs
omarchy plugin validate .
bash -n ipc-file.sh list.sh tests/qml-smoke.sh
bash tests/qml-smoke.sh
```

The proposal test copies the three installed upstream files into a temporary
directory, checks and applies the patch there, and executes the patched registry
and shell helper. It verifies background route/alias selection, repeated enable,
disable, removal, native theme routing, and strict provider opt-in. Desktop
button handlers are executed separately. These are JS integration tests, not
a full patched-shell graphical acceptance test.

The installation test runs Omarchy's actual add/enable/disable/remove commands
against a local git fixture and isolated HOME. Only the shell IPC transport is
substituted with an adapter to the real registry implementation. It checks user
menu comments, unrelated keybindings and plugin settings byte-for-byte, and
checks shell configuration semantically. Nothing is installed into the real HOME.

On 2026-11-05, the real compositor reported both requested background bindings
and the native theme bindings (Super + Ctrl + T and Super + Ctrl + Shift + Space).
The installed Frame and Flow picker was opened and its **Align** and
**Transition** controls visually verified; Appearance visibly contains Background.
Synthetic hotkey attempts did not produce a visible picker, so those are
inconclusive and are not claimed as successful end-to-end checks. The user menu
and bindings checksums remained unchanged. Left/right desktop double-clicks
are covered in code, not a completed live pointer check.

Before release, Omarchy must accept/ship the API, and a full live acceptance run
must exercise every table row, including selecting Appearance → Background,
both aliases, actual hotkeys, and desktop double-clicks. Repeat after disable,
re-enable, update, and removal, checking unrelated configuration and visible
controls. This cannot be certified on unmodified stock 4.5.

## Migration after upstream support ships

Update Omarchy to a release containing this API, then update and restart Frame
and Flow using the README commands. No menu/keybinding migration is needed for
stock routes. If earlier manual integrations exist, review and remove only
their specific Background action/keybinding overrides; preserve other rows,
comments and bindings. Old `style.background` aliases can still point at legacy
commands and should be reviewed alongside `appearance.background`. Never reset
the full menu or bindings file.

The upstream patch is deliberately kept out of the plugin installer. Package
upgrades would overwrite a local copy, so applying it to `/usr/share/omarchy`
is not a supported migration step.
