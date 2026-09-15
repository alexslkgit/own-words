#!/bin/bash
# Installs the post-commit hook in the private study-deck repo that triggers
# the public sync. Not run automatically -- run manually when ready.
#
# Usage: install-hook.sh [PRIVATE_REPO_PATH]
set -euo pipefail

PRIVATE="${1:-$HOME/Developer/study-deck}"
HOOK_PATH="$PRIVATE/.git/hooks/post-commit"

if [ ! -d "$PRIVATE/.git" ]; then
    echo "install-hook: $PRIVATE is not a git repository" >&2
    exit 1
fi

cat > "$HOOK_PATH" <<'EOF'
#!/bin/bash
"$HOME/Developer/own-words/scripts/sync-public.sh" >/dev/null 2>&1 &
EOF

chmod +x "$HOOK_PATH"
echo "install-hook: installed $HOOK_PATH"
