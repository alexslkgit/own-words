#!/bin/bash
# Sync the public engine mirror from the private study-deck repo.
# Meant to be called from the private repo's post-commit hook.
#
# Usage: sync-public.sh [PRIVATE_REPO_PATH] [PUBLIC_REPO_PATH]
set -euo pipefail

PRIVATE="${1:-$HOME/Developer/study-deck}"
PUBLIC="${2:-$HOME/Developer/own-words}"

LOG_DIR="$HOME/.claude/logs"
LOG_FILE="$LOG_DIR/own-words-sync.log"
mkdir -p "$LOG_DIR"

log() {
    echo "$(date -u '+%Y-%m-%dT%H:%M:%SZ') $1" >> "$LOG_FILE"
}

fail() {
    log "FAILED: $1"
    echo "sync-public: $1" >&2
    exit 1
}

if [ ! -d "$PRIVATE/core" ]; then
    fail "private core dir not found at $PRIVATE/core"
fi

mkdir -p "$PUBLIC/core"

rsync -a --delete --exclude 'strings.ru.js' --exclude '.DS_Store' "$PRIVATE/core/" "$PUBLIC/core/"

# Cyrillic gate: macOS grep is BSD grep and has no -P (PCRE), so use perl
# unicode-aware matching over every non-.git file instead.
cyrillic_found=0
while IFS= read -r -d '' f; do
    if perl -CSD -ne 'exit 1 if /\p{Cyrillic}/' "$f"; then
        :
    else
        cyrillic_found=1
        echo "sync-public: Cyrillic found in $f" >&2
    fi
done < <(find "$PUBLIC" -type f -not -path '*/.git/*' -print0)

if [ "$cyrillic_found" -ne 0 ]; then
    fail "Cyrillic found, refusing"
fi

if [ -f "$PUBLIC/core/selftest.js" ]; then
    if ! node "$PUBLIC/core/selftest.js"; then
        fail "selftest.js failed"
    fi
fi

cd "$PUBLIC"
git add -A
if ! git diff --cached --quiet; then
    commit_msg="$(cd "$PRIVATE" && git log -1 --pretty=%s)"
    git commit -q -m "$commit_msg"
    (git push -q origin main >/dev/null 2>&1 &)
    log "OK: committed and pushed (\"$commit_msg\")"
else
    log "OK: nothing changed"
fi
