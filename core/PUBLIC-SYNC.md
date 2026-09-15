# core/ is mirrored, so treat it as public

`core/` is copied to <https://github.com/alexslkgit/own-words> on every commit, by
`.git/hooks/post-commit` (installed by a separate step; a fresh clone or a `git worktree` has no
hook, so the mirror does not move there until it is installed by hand).

- **`core/strings.ru.js` is not mirrored.** The public `core/deck.html` loads only `strings.en.js`
  and carries `lang="en"`; the private one loads both and stays `lang="ru"`.
- **Every user-visible string goes through `S()`** - `S(key, ...args)` for text, `S.n(count, key)`
  for a counted noun. A literal in the code is a bug, not a shortcut.
- **No Cyrillic in `core/`**: not in code, not in comments, not in the subject of a commit that
  touches it. `core/selftest.js` is the one exemption, because its fixtures are the decks' own
  text. A parsing token that must match Russian deck text either lives in `core/strings.ru.js`
  (the answer markup's block headings, under `blockTokens`) or is written as `\uXXXX` escapes in
  `core/model.js` (the tags, the pointer at another card).
- **Run `node core/selftest.js` before committing**: at least as many checks as before, all passed.
