---
name: own-words
description: Build a study deck from a topic or a document and print a link that opens it; use when the user says /own-words, wants flashcards, wants to learn or memorise something, or wants to check what they understood
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

## Quality bar

- No card whose answer is a list of the words already in the question.
- No yes/no questions: every question asks for an explanation, a comparison, a mechanism
  or a number, never a fact he can answer without thinking.
- Every card is answerable on its own, without having read the card before it.
