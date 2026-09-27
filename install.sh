#!/usr/bin/env bash
#
# vulnlab installer
#
# Installs the vulnlab plugin, skill, and /vulnlab command into the OpenCode
# configuration, and installs the plugin's @opencode/plugin dependency pinned to
# the version of the running opencode CLI.
#
# Usage:
#   ./install.sh            # install into the global config (~/.config/opencode)
#   ./install.sh --local    # install into this repo's .opencode instead
#
set -euo pipefail

REPO_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
MODE="global"

for arg in "$@"; do
  case "$arg" in
    --local) MODE="local" ;;
    -h|--help)
      sed -n '2,14p' "$0" | sed 's/^# \{0,1\}//'
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

command -v opencode >/dev/null 2>&1 || {
  echo "error: the opencode CLI is not in PATH" >&2
  exit 1
}

VERSION="$(opencode --version 2>/dev/null | grep -oE '[0-9]+\.[0-9]+\.[0-9]+' | head -1)"
[ -n "$VERSION" ] || VERSION="latest"

PLUGIN_SRC="$REPO_DIR/plugin/vulnlab"
SKILL_SRC="$REPO_DIR/skill/vulnlab"
CMD_SRC="$REPO_DIR/command/vulnlab.md"
TEMPLATES_SRC="$PLUGIN_SRC/templates"

for p in "$PLUGIN_SRC/index.ts" "$TEMPLATES_SRC/challenge-README.md" "$SKILL_SRC/SKILL.md" "$CMD_SRC"; do
  [ -e "$p" ] || {
    echo "error: expected file missing: $p" >&2
    exit 1
  }
done

echo "Installing vulnlab ($MODE) into $CONFIG_DIR"

# 1. Install the plugin dependency, pinned to the running OpenCode version.
cd "$PLUGIN_SRC"
if command -v bun >/dev/null 2>&1; then
  bun add --exact "@opencode/plugin@$VERSION" >/dev/null
elif command -v npm >/dev/null 2>&1; then
  npm install --no-save --silent "@opencode/plugin@$VERSION"
else
  echo "error: need bun or npm to install @opencode/plugin" >&2
  exit 1
fi
echo "  dependency: @opencode/plugin@$VERSION"

# 2. Link plugin, skill, and command into the config directory.
mkdir -p "$CONFIG_DIR/plugins" "$CONFIG_DIR/skills" "$CONFIG_DIR/commands"

link() {
  local src="$1" dest="$2"
  if [ -e "$dest" ] && [ ! -L "$dest" ]; then
    echo "error: $dest exists and is not a symlink; remove it first" >&2
    exit 1
  fi
  ln -sfn "$src" "$dest"
}

link "$PLUGIN_SRC" "$CONFIG_DIR/plugins/vulnlab"
link "$SKILL_SRC" "$CONFIG_DIR/skills/vulnlab"
link "$CMD_SRC" "$CONFIG_DIR/commands/vulnlab.md"

# 3. Reload the running service so the plugin and skill load now.
opencode reload >/dev/null 2>&1 || true

echo "  plugin  -> $CONFIG_DIR/plugins/vulnlab"
echo "  skill   -> $CONFIG_DIR/skills/vulnlab"
echo "  command -> $CONFIG_DIR/commands/vulnlab.md"
echo "Done. Run: /vulnlab new name=\"My App\" language=python archetype=web-app"
