#!/bin/bash
# Installs the launchd agent that periodically runs sync-public.sh.
# Not run automatically -- run manually when ready.
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PLIST_NAME="com.alexslk.own-words-sync.plist"
DEST="$HOME/Library/LaunchAgents/$PLIST_NAME"

mkdir -p "$HOME/Library/LaunchAgents"
cp "$SCRIPT_DIR/$PLIST_NAME" "$DEST"

launchctl load "$DEST"
echo "install-launchd: installed and loaded $DEST"
