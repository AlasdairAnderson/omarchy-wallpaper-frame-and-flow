#!/bin/bash
# Compile and instantiate the plugin in a separate Quickshell process. Its
# picker stays closed and background windows stay suspended throughout.
set -euo pipefail
repo=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
omarchy_path=${OMARCHY_PATH:-/usr/share/omarchy}
test_dir=$(mktemp -d)
trap 'rm -rf -- "$test_dir"' EXIT
mkdir -m 700 "$test_dir/runtime"
mkdir -p "$test_dir/home" "$test_dir/cache"
mkdir -p "$test_dir/bin" "$test_dir/home/.config/omarchy" "$test_dir/home/.local/state/omarchy/current/theme/backgrounds"
printf '{"enabled":true,"interval":10}\n' > "$test_dir/home/.config/omarchy/background-slideshow.json"
# Generate a tiny deterministic PNG fixture with a panoramic aspect ratio.
python3 - "$test_dir/home/.local/state/omarchy/current" <<'PYFIXTURE'
from pathlib import Path
import struct, sys, zlib
state = Path(sys.argv[1])
def chunk(kind, data):
    return struct.pack('>I', len(data)) + kind + data + struct.pack('>I', zlib.crc32(kind + data))
width, height = 384, 108
png = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
png += chunk(b'IDAT', zlib.compress((b'\0' + b'\xff\0\0' * width) * height)) + chunk(b'IEND', b'')
for name in ('a.png', 'b.png'):
    (state / 'theme/backgrounds' / name).write_bytes(png)
(state / 'theme.name').write_text('example')
(state / 'background').symlink_to(state / 'theme/backgrounds/a.png')
PYFIXTURE
cat > "$test_dir/bin/omarchy-theme-bg-set" <<'BACKEND'
#!/bin/bash
set -e
printf '%s' "$1" > "$FRAME_FLOW_ROTATED"
ln -nsf "$1" "$HOME/.local/state/omarchy/current/background"
BACKEND
chmod +x "$test_dir/bin/omarchy-theme-bg-set"
ln -s "$omarchy_path/shell/Commons" "$test_dir/Commons"
ln -s "$omarchy_path/shell/Ui" "$test_dir/Ui"
cat > "$test_dir/shell.qml" <<'QML'
import Quickshell
import QtQuick
ShellRoot {
  id: harness
  Item { id: scene; visible: false }
  property bool passed: true
  property var instances: []
  Component.onCompleted: {
    for (var file of ["ImagePicker.qml", "Background.qml", "AlignedImage.qml"]) {
      var component = Qt.createComponent("file://" + Quickshell.env("FRAME_FLOW_ROOT") + "/" + file, Component.PreferSynchronous)
      if (component.status !== Component.Ready) {
        console.error("SMOKE FAIL: " + file + ": " + component.errorString())
        passed = false
        continue
      }
      var properties = file === "Background.qml" ? { suspended: true } : {}
      if (file === "AlignedImage.qml") properties = {
        width: 1920, height: 1080, nativeSize: { width: 384, height: 108 }, positionRatio: 0.75,
        decodeSize: Qt.size(1920, 1080),
        path: Quickshell.env("HOME") + "/.local/state/omarchy/current/theme/backgrounds/a.png"
      }
      var instance = component.createObject(scene, properties)
      if (!instance) {
        console.error("SMOKE FAIL: could not instantiate " + file)
        passed = false
      } else {
        instances.push(instance)
        if (file === "AlignedImage.qml" && instance.geometry.x !== -1440) {
          console.error("SMOKE FAIL: wrong alignment geometry")
          passed = false
        }
      }
    }
  }
  Timer {
    interval: 11200
    running: true
    onTriggered: {
      if (harness.instances.length !== 3 || !harness.instances[2].ready) {
        console.error("SMOKE FAIL: wallpaper did not decode")
        harness.passed = false
      }
      console.log(harness.passed ? "FRAME FLOW QML PASS" : "FRAME FLOW QML FAIL")
      Quickshell.execDetached(["kill", "-TERM", String(Quickshell.processId)])
    }
  }
}
QML
status=0
# The socket may be relative to the original runtime directory. Keep the
# compositor connection while moving all test IPC/config/cache files to /tmp.
display=${WAYLAND_DISPLAY:-wayland-1}
[[ $display == /* ]] || display="${XDG_RUNTIME_DIR:-/run/user/$UID}/$display"
env HOME="$test_dir/home" XDG_CONFIG_HOME="$test_dir/home/.config" \
  XDG_STATE_HOME="$test_dir/home/.local/state" XDG_CACHE_HOME="$test_dir/cache" \
  XDG_RUNTIME_DIR="$test_dir/runtime" WAYLAND_DISPLAY="$display" \
  QT_QPA_PLATFORM=wayland QT_QPA_PLATFORMTHEME=none FRAME_FLOW_ROOT="$repo" \
  PATH="$test_dir/bin:$PATH" FRAME_FLOW_ROTATED="$test_dir/rotated" \
  timeout 20 quickshell -p "$test_dir" --no-color >"$test_dir/log" 2>&1 || status=$?
cat "$test_dir/log"
[[ $status == 0 || $status == 143 ]] || exit "$status"
if rg -q 'SMOKE FAIL|ReferenceError|TypeError|Unable to assign|Binding loop|failed to load|Error:' "$test_dir/log"; then
  exit 1
fi
rg -q 'FRAME FLOW QML PASS' "$test_dir/log"

[[ -f "$test_dir/rotated" ]] || { echo 'SMOKE FAIL: slideshow timer did not rotate'; exit 1; }
[[ $(cat "$test_dir/rotated") == "$test_dir/home/.local/state/omarchy/current/theme/backgrounds/b.png" ]] || { echo 'SMOKE FAIL: wrong slideshow selection'; exit 1; }
echo 'FRAME FLOW SLIDESHOW PASS'
