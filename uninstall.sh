#!/usr/bin/env bash
#
# vulnlab uninstaller
#
# Removes the symlinks created by install.sh. It never deletes real directories
# or the plugin source; it only removes symlinks that point back into this repo.
#
# Usage:
#   ./uninstall.sh           # remove from the global config
#   ./uninstall.sh --local   # remove from this repo's .opencode
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="global"

for arg in "$@"; do
  case "$arg" in
    --local) MODE="local" ;;
    -h|--help)
      sed -n '2,12p' "$0" | sed 's/^# \{0,1\}//'
      exit 0
      ;;
    *)
      echo "unknown option: $arg" >&2
      exit 2
      ;;
  esac
done

if [ "$MODE" = "global" ]; then
  CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/opencode"
else
  CONFIG_DIR="$REPO_DIR/.opencode"
fi

remove_link() {
  local dest="$1"
  if [ -L "$dest" ]; then
    rm -f "$dest"
    echo "  removed $dest"
  elif [ -e "$dest" ]; then
    echo "  skipped $dest (not a symlink)"
  else
    echo "  absent  $dest"
  fi
}

echo "Removing vulnlab ($MODE) from $CONFIG_DIR"
remove_link "$CONFIG_DIR/plugins/vulnlab"
remove_link "$CONFIG_DIR/skills/vulnlab"
remove_link "$CONFIG_DIR/commands/vulnlab.md"
opencode reload >/dev/null 2>&1 || true
echo "Done."
