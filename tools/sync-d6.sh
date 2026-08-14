#!/usr/bin/env bash
# Re-copy the D6 web prototype into games/d6/ so the build embedded on
# /notes/projects/d6/ matches the source repo. Run after changing the game.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
SRC="${1:-$HOME/GitHub/D6/web}"
DEST="$ROOT/games/d6"

[ -f "$SRC/index.html" ] || { echo "no D6 web build at $SRC" >&2; exit 1; }

mkdir -p "$DEST"
rsync -a --delete \
  --exclude 'test/' --exclude 'run.sh' --exclude 'README.md' \
  "$SRC/" "$DEST/"

echo "synced $SRC -> $DEST"
git -C "$ROOT" status --short games/d6
