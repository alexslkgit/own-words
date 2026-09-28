---
name: own-words
description: Build a study deck from a topic or a document and print a link that opens it; use when the user says /own-words, wants flashcards, wants to learn or memorise something, or wants to check what they understood. Also answers a message that starts with [own-words simplify] or [own-words deeper], copied from a card page
disable-model-invocation: false
license: MIT
---

# own-words

Turns a topic, or a document the user hands over, into a deck of question cards on
`https://alexslkgit.github.io/own-words/deck.html`. He answers each card in his own words
before the prepared answer is shown, so the deck only works if the questions are the real
substance of the topic and the answers are worth reading.

## Procedure

1. **Take the topic or file from the arguments.** If a file path is given, read it and
   build the deck from its actual content, not from what the filename suggests. If only a
   topic name is given, write the deck from what you know of it.

2. **Write 8 to 30 cards in blocks.** Group related cards into a handful of blocks, each
   with a short title. The deck is one JSON object, and this is the whole of its shape:

   ```json
   {
     "key": "topic-slug",
     "round": 1,
     "title": "What the deck is about",
     "copyPrefix": "Short name",
     "purpose": "One line on what the deck is for.",
     "gate": true,
     "from": [{ "round": 1, "t": "One sentence on what this round is for." }],
     "marks": [
       { "id": "know",  "label": "I knew it", "side": "done", "key": "1" },
       { "id": "again", "label": "see again", "side": "mine", "key": "2" }
     ],
     "blocks": [
       { "n": 1, "t": "The name of this group of cards",
         "q": [
           { "id": "s1",
             "q": "The question, asked in one sentence.",
             "tag": "three or four words naming what the card is about",
             "a": "The prepared answer.",
             "reply": { "mode": "text" } }
         ] }
     ]
   }
   ```

   - `key` is the topic slug, lowercase, hyphenated, written once. It is the deck's bucket
     in the reader's browser, so it is never reused for a different deck.
   - `marks` is not optional and has no default: the engine hard-codes no marks, so a deck
     that declares none leaves the reader no way to close a card. Write the pair above
     unless the deck has a reason for other words. `side: "done"` is the closed side,
     `side: "mine"` is the side still owed, and `key` is the keyboard shortcut.
   - `gate: true` is what hides the prepared answer until he has written his own. A single
     card that is there to be read rather than answered overrides it with `"gate": false`.
   - `copyPrefix` is the deck's short human name: it heads the page and the text the copy
     button produces. `from` is one sentence about the round, shown above every card.
   - `reply` is `{ "mode": "text" }` on every card, except a card with nothing to answer,
     which takes `{ "mode": "none" }`.
   - `tag` is the short line printed above the answer, three or four words naming what the
     card is about. It is not a category and not a repeat of the block title.
   - `id` is short, stable and unique across the whole deck (`s1`, `s2`, …). A card with no
     `id`, no `q`, or an `id` already used is dropped rather than shown broken.
   - Every card gets both `q` and `a`; a card without a real answer does not belong here.
   - Each answer is 60 to 140 words, one idea per card, and uses `**phrase**` once or
     twice to mark the load-bearing term or claim. Use plain paragraphs: the block tokens
     `Diagram:`, `Flow:`, `Tree:` and `_aside_` are available for a card that genuinely
     needs one, each on its own line, but most cards need none of them.
   - `purpose` is optional: one line on what the reader needs the deck for. A request for a
     simpler answer carries it, and it decides which details may be dropped.
   - Leave `round` at 1.
   - Prefer facts the reader can check over opinion or paraphrase.

3. **Save the deck** to `<topic-slug>.deck.json` in the current directory.

4. **Run the link script:**

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/own-words/link.mjs" <topic-slug>.deck.json
   ```

   It validates the file and prints the link on success, or a one-line reason and a
   non-zero exit on failure, fix the deck and run it again rather than guessing.

5. **Reply with the link and the card count, nothing else.**

## A request for a simpler answer

A message whose first line is `[own-words simplify]` or `[own-words deeper]` was copied from a
card page after the reader marked what he did not understand. It is not a new topic: build no
deck. The fields under that line are `deck:` (the deck key), `card:` (the card id), `base:`
(the stamp of the card's answer), and `budget:` for a simpler answer or `word:` for a note on
one word.

1. **Write the result by these rules,** the same ones the request carries:
   1. At most `budget` words, hard. Aim for about two thirds of it.
   2. Every marked word: replace it with plain words, or keep it and add a gloss in
      parentheses of at most 6 words.
   3. No new unexplained terms: every technical term in the output either appears unmarked in
      the original or carries a gloss.
   4. Every marked piece: rewrite it in plain words, same facts.
   5. Drop details the deck's purpose does not need, and list them in `removed` as short
      phrases.
   6. Never add a fact that is not in the original; keep the card's core claim and any
      one-line rule.
   7. "Simpler still" is the same request made from the current simpler text, with its word
      count as the budget.
   8. "Deeper on a word" explains one word in at most 40 words. It is a note shown under the
      answer and never merged into it: do not rewrite the answer.

2. **Count before you answer.** A word is a whitespace-separated token with at least one letter
   or digit in it. The page counts the same way and refuses anything over the budget, so a
   reply one word over is a wasted round trip.

3. **Write it into the deck file when you have it.** Find the `.deck.json` whose `key` is the
   request's `deck:`. On the card with the request's `card:` id, set

   ```json
   "simple": { "text": "the simpler answer", "removed": ["a dropped detail"], "base": "copied from the request" }
   ```

   beside `a`, and never change `a` or any other field. Copy `base` exactly as the request
   gives it, also for "simpler still": it is the stamp of the answer, and the page ignores a
   version whose base no longer matches the answer on the card. A note on a word goes into
   `simple.deep` as `{ "w": "the word", "t": "the note" }`, replacing a note on the same word;
   a card with no `simple` yet has nowhere to hold one, so leave the file alone and give the
   block only. Then run the link script again and give the new link: opening it replaces the
   copy kept in the browser and keeps the reader's answers.

4. **Always end the reply with the fenced block** the request shows, filled in, even after
   writing the file, because the reader may be on a page that was opened from a different copy:

   ````
   ```own-words
   kind: simple
   card: s1
   base: copied from the request
   text:
   the simpler answer, a blank line between paragraphs
   removed:
   - a dropped detail
   ```
   ````

   A note on a word has `kind: deeper`, a `word:` line after `base:`, and no `removed:`.

## Quality bar

- No card whose answer is a list of the words already in the question.
- No yes/no questions: every question asks for an explanation, a comparison, a mechanism
  or a number, never a fact he can answer without thinking.
- Every card is answerable on its own, without having read the card before it.
