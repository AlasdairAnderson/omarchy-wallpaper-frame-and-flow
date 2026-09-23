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

action="${1:-}"
file="${2:-}"
content="${3:-}"

if [[ -z "$action" || -z "$file" ]]; then
  echo "Usage: $0 {touch|write} <path> [content]" >&2
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

# 2. Target path parent directory must resolve inside verified runtime_dir
parent_dir=$(dirname "$file")
real_parent=$(realpath -q "$parent_dir" 2>/dev/null) || {
  echo "ipc-file: invalid parent directory: $parent_dir" >&2
  exit 1
}
real_runtime=$(realpath -q "$runtime_dir" 2>/dev/null) || exit 1

if [[ "$real_parent" != "$real_runtime" && "$real_parent" != "$real_runtime"/* ]]; then
  echo "ipc-file: target path is outside verified runtime directory: $file" >&2
  exit 1
fi

# Parent directory must be owned by user and mode 0700
parent_stat=$(stat -Lc '%u:%a' "$real_parent" 2>/dev/null) || exit 1
if [[ "$parent_stat" != "${uid}:700" ]]; then
  echo "ipc-file: parent directory must be owned by user and mode 0700 (got $parent_stat)" >&2
  exit 1
fi

# 3. Reject symlink targets
if [[ -L "$file" ]]; then
  echo "ipc-file: rejecting symlink target: $file" >&2
  exit 1
fi

# 4. If target exists, verify it is a regular file owned by current user
if [[ -e "$file" ]]; then
  if [[ ! -f "$file" ]]; then
    echo "ipc-file: rejecting non-regular file: $file" >&2
    exit 1
  fi
  file_owner=$(stat -Lc '%u' "$file" 2>/dev/null) || exit 1
  if [[ "$file_owner" != "$uid" ]]; then
    echo "ipc-file: rejecting file owned by another user: $file" >&2
    exit 1
  fi
fi

# 5. Perform safe, atomic, no-follow file operation
case "$action" in
  touch)
    python3 -c '
import os, sys
path = sys.argv[1]
try:
    fd = os.open(path, os.O_WRONLY | os.O_CREAT | os.O_TRUNC | os.O_NOFOLLOW, 0o600)
    os.close(fd)
except OSError as err:
    sys.stderr.write(f"ipc-file: touch error: {err}\n")
    sys.exit(1)
' "$file"
    ;;
  write)
    tmp=$(mktemp -p "$real_parent" .ipc.XXXXXX)
    chmod 0600 "$tmp"
    printf '%s\n' "$content" > "$tmp"
    mv -T -f "$tmp" "$file"
    ;;
  *)
    echo "ipc-file: unknown action: $action" >&2
    exit 1
    ;;
esac
