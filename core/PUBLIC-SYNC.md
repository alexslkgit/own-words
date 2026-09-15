# core/ is mirrored, so treat it as public

`core/` is copied to <https://github.com/alexslkgit/own-words> on every commit, by
`.git/hooks/post-commit` (installed by a separate step; a fresh clone or a `git worktree` has no
hook, so the mirror does not move there until it is installed by hand).

- **Only the English table is mirrored.** Every other `core/strings.<lang>.js` stays here, and so
  does `core/deck.html`, which is a private page template: the public repo has its own `deck.html`
  at its root, written in English.
- **No language name and no string of his own in `core/`**, in code, in comments or in this file:
  the sync gate greps what it is about to publish and refuses on a language name, a deck name, a
  file name carrying one, or a path out of his home. Write "the second table", "another
  language's table", "a private deck".
- **Every user-visible string goes through `S()`** - `S(key, ...args)` for text, `S.n(count, key)`
  for a counted noun. A literal in the code is a bug, not a shortcut.
- **No Cyrillic in `core/`**: not in code, not in comments, not in the subject of a commit that
  touches it. `core/selftest.js` is the one exemption, because its fixtures are the decks' own
  text. A parsing token that must match a deck's own text either lives in that language's
  `core/strings.<lang>.js` (the answer markup's block headings, under `blockTokens`) or is written
  as `\uXXXX` escapes in `core/model.js` (the tags, the pointer at another card).
- **Run `node core/selftest.js` before committing**: at least as many checks as before, all passed.
