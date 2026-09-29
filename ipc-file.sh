#!/bin/bash
set -euo pipefail

# ipc-file.sh: Securely manage IPC exchange files (selectionFile and doneFile).
#
# Security invariants enforced:
# 1. Target must reside in a verified runtime directory ($XDG_RUNTIME_DIR or /run/user/<uid>)
#    that is owned exclusively by the current user and restricted to mode 0700.
# 2. Target must not be a symbolic link (symlink traversal rejected).
# 3. If target exists, it must be a regular file owned by the current user.
# 4. File creation and updates use atomic, no-follow operations (O_NOFOLLOW / atomic rename)
#    with permissions 0600, eliminating shell redirection vulnerabilities.
# 5. Sensitive wallpaper paths are read via protected environment variables or stdin
#    to prevent argv leakage via /proc/<pid>/cmdline.

action="${1:-}"
file="${2:-}"
content="${3:-}"

if [[ -z "$action" || -z "$file" ]]; then
  echo "Usage: $0 {touch|write|apply} <path> [args...]" >&2
  exit 1
fi

uid=$(id -u)
runtime_dir="${XDG_RUNTIME_DIR:-/run/user/$uid}"

# 1. Verify runtime directory exists, owned by user, and mode 0700
if [[ ! -d "$runtime_dir" ]]; then
  echo "ipc-file: runtime directory missing: $runtime_dir" >&2
  exit 1
fi

rt_stat=$(stat -Lc '%u:%a' "$runtime_dir" 2>/dev/null) || exit 1
if [[ "$rt_stat" != "${uid}:700" ]]; then
  echo "ipc-file: runtime directory must be owned by user and mode 0700 (got $rt_stat)" >&2
  exit 1
fi

real_runtime=$(realpath -q "$runtime_dir" 2>/dev/null) || exit 1

validate_target() {
  local target="$1"
  local target_parent real_parent parent_stat file_owner

  # Target path parent directory must resolve inside verified runtime_dir
  target_parent=$(dirname "$target")
  real_parent=$(realpath -q "$target_parent" 2>/dev/null) || {
    echo "ipc-file: invalid parent directory: $target_parent" >&2
    exit 1
  }

  if [[ "$real_parent" != "$real_runtime" && "$real_parent" != "$real_runtime"/* ]]; then
    echo "ipc-file: target path is outside verified runtime directory: $target" >&2
    exit 1
  fi

  # Parent directory must be owned by user and mode 0700
  parent_stat=$(stat -Lc '%u:%a' "$real_parent" 2>/dev/null) || exit 1
  if [[ "$parent_stat" != "${uid}:700" ]]; then
    echo "ipc-file: parent directory must be owned by user and mode 0700 (got $parent_stat)" >&2
    exit 1
  fi

  # Reject symlink targets
  if [[ -L "$target" ]]; then
    echo "ipc-file: rejecting symlink target: $target" >&2
    exit 1
  fi

  # If target exists, verify it is a regular file owned by current user
  if [[ -e "$target" ]]; then
    if [[ ! -f "$target" ]]; then
      echo "ipc-file: rejecting non-regular file: $target" >&2
      exit 1
    fi
    file_owner=$(stat -Lc '%u' "$target" 2>/dev/null) || exit 1
    if [[ "$file_owner" != "$uid" ]]; then
      echo "ipc-file: rejecting file owned by another user: $target" >&2
      exit 1
    fi
  fi
}

atomic_touch() {
  local target="$1"
  local target_parent real_parent tmp

  target_parent=$(dirname "$target")
  real_parent=$(realpath -q "$target_parent" 2>/dev/null) || exit 1
  tmp=$(mktemp -p "$real_parent" .ipc.XXXXXX)
  chmod 0600 "$tmp"
  mv -T -f "$tmp" "$target"
}

atomic_write() {
  local target="$1"
  local data="$2"
  local target_parent real_parent tmp

  target_parent=$(dirname "$target")
  real_parent=$(realpath -q "$target_parent" 2>/dev/null) || exit 1
  tmp=$(mktemp -p "$real_parent" .ipc.XXXXXX)
  chmod 0600 "$tmp"
  printf '%s\n' "$data" > "$tmp"
  mv -T -f "$tmp" "$target"
}

save_alignment() {
  local cfg_file="$1"
  local align_val="$2"
  local path_val="$3"

  [[ -n "$cfg_file" && -n "$align_val" && -n "$path_val" ]] || return 0

  local cfg_parent real_cfg_parent parent_stat
  cfg_parent=$(dirname "$cfg_file")
  mkdir -p "$cfg_parent"
  real_cfg_parent=$(realpath -q "$cfg_parent" 2>/dev/null) || {
    echo "ipc-file: invalid config directory: $cfg_parent" >&2
    return 1
  }

  parent_stat=$(stat -Lc '%u' "$real_cfg_parent" 2>/dev/null) || return 1
  if [[ "$parent_stat" != "$uid" ]]; then
    echo "ipc-file: config directory must be owned by user (got $parent_stat)" >&2
    return 1
  fi

  if [[ -L "$cfg_file" ]]; then
    echo "ipc-file: rejecting symlink config target: $cfg_file" >&2
    return 1
  fi

  # Pass wallpaper path safely via environment, NEVER via command line arguments
  SELECTED_WALLPAPER_PATH="$path_val" python3 -c '
import json, os, sys

cfg_file = sys.argv[1]
align = sys.argv[2]
path = os.environ.get("SELECTED_WALLPAPER_PATH", "")

if not path or not align:
    sys.exit(0)

if os.path.islink(cfg_file):
    sys.stderr.write(f"ipc-file: rejecting symlink config file: {cfg_file}\n")
    sys.exit(1)

filename = os.path.basename(path)
data = {}
if os.path.isfile(cfg_file):
    try:
        with open(cfg_file, "r", encoding="utf-8") as f:
            data = json.load(f)
            if not isinstance(data, dict):
                data = {}
    except Exception:
        data = {}

data[filename] = align
data[path] = align

parent_dir = os.path.dirname(os.path.abspath(cfg_file))
os.makedirs(parent_dir, exist_ok=True)
tmp_file = os.path.join(parent_dir, f".align.{os.getpid()}.tmp")
with open(tmp_file, "w", encoding="utf-8") as f:
    json.dump(data, f, indent=2)
os.chmod(tmp_file, 0o600)
os.replace(tmp_file, cfg_file)
' "$cfg_file" "$align_val"
}

case "$action" in
  touch)
    validate_target "$file"
    atomic_touch "$file"
    ;;
  write)
    validate_target "$file"
    payload=""
    if [[ $# -ge 3 ]]; then
      payload="$content"
    elif [[ -n "${SELECTED_WALLPAPER_PATH:-}" ]]; then
      payload="$SELECTED_WALLPAPER_PATH"
    elif [[ ! -t 0 ]]; then
      payload=$(cat)
    fi
    atomic_write "$file" "$payload"
    ;;
  apply)
    selection_file="$file"
    done_file="${3:-}"
    alignments_cfg="${4:-}"
    align_val="${5:-}"

    wallpaper_path="${SELECTED_WALLPAPER_PATH:-}"
    if [[ -z "$wallpaper_path" && ! -t 0 ]]; then
      wallpaper_path=$(cat)
    fi
    if [[ -z "$wallpaper_path" ]]; then
      echo "ipc-file: apply requires wallpaper path via SELECTED_WALLPAPER_PATH or stdin" >&2
      exit 1
    fi

    # 1. Validate all IPC exchange targets before making ANY changes
    validate_target "$selection_file"
    if [[ -n "$done_file" ]]; then
      validate_target "$done_file"
    fi

    # 2. Update alignments configuration if requested
    if [[ -n "$alignments_cfg" && -n "$align_val" ]]; then
      save_alignment "$alignments_cfg" "$align_val" "$wallpaper_path"
    fi

    # 3. Write selection file securely
    atomic_write "$selection_file" "$wallpaper_path"

    # 4. Release done file securely if requested
    if [[ -n "$done_file" ]]; then
      atomic_touch "$done_file"
    fi
    ;;
  *)
    echo "ipc-file: unknown action: $action" >&2
    exit 1
    ;;
esac
