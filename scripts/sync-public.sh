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

# One table goes out and the rest stay behind. --include is listed first because rsync takes the
# first rule a name matches, so the one table that is published has to be named before the rule
# that holds the others back. core/deck.html is the private page template; the public repo has
# its own deck.html at the root and does not take that one.
rsync -a --delete \
    --include 'strings.en.js' --exclude 'strings.*.js' \
    --exclude 'deck.html' --exclude 'selftest.js' --exclude '.DS_Store' \
    "$PRIVATE/core/" "$PUBLIC/core/"

# Cyrillic gate: macOS grep is BSD grep and has no -P (PCRE), so use perl
# unicode-aware matching over every file git would publish (ignored dirs skipped).
# The post-commit hook runs with the private repo as its working directory, so every path out of
# git ls-files is read back with $PUBLIC in front of it or the gate would read the wrong tree.
cyrillic_found=0
while IFS= read -r -d '' f; do
    grep -Iq . "$PUBLIC/$f" || continue   # binary (png, gif) is not text
    if perl -CSD -ne 'exit 1 if /\p{Cyrillic}/' "$PUBLIC/$f"; then
        :
    else
        cyrillic_found=1
        echo "sync-public: Cyrillic found in $f" >&2
    fi
done < <(cd "$PUBLIC" && git ls-files -z --cached --others --exclude-standard)

if [ "$cyrillic_found" -ne 0 ]; then
    fail "Cyrillic found, refusing"
fi

# Second gate, same list of files. Nothing published may name a language, name a private deck, or
# carry anything of his own. Every word below wears a bracket around one letter: to grep it is
# still the word, to a reader of this file it is not, so this script - which is published too -
# is not the first thing its own gate finds.
banned='r[u]ssian|u[k]rainian|[r]u\.js|r[a]ads|m[a]yflower|s[l]obodianiuk|@[g]mail'
banned_found=0
while IFS= read -r -d '' f; do
    if grep -IniE "$banned" "$PUBLIC/$f" >/dev/null 2>&1; then
        banned_found=1
        echo "sync-public: a private word in $f" >&2
        grep -IniE "$banned" "$PUBLIC/$f" | head -5 >&2
    fi
done < <(cd "$PUBLIC" && git ls-files -z --cached --others --exclude-standard)

if [ "$banned_found" -ne 0 ]; then
    fail "a private word found, refusing"
fi

if [ -f "$PUBLIC/core/selftest.js" ]; then
    if ! node "$PUBLIC/core/selftest.js"; then
        fail "selftest.js failed"
    fi
fi

cd "$PUBLIC"
git add -A -- core
if ! git diff --cached --quiet; then
    commit_msg="$(cd "$PRIVATE" && git log -1 --pretty=%s)"
    git commit -q -m "$commit_msg"
    (git push -q origin main >/dev/null 2>&1 &)
    log "OK: committed and pushed (\"$commit_msg\")"
else
    log "OK: nothing changed"
fi
