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
   with a short title. The deck is one JSON object:

   ```json
   {
     "key": "topic-slug",
     "round": 1,
     "title": "Human title of the deck",
     "blocks": [
       {
         "n": 1,
         "t": "Block title",
         "q": [
           { "id": "s1", "q": "The question text.", "a": "The prepared answer." }
         ]
       }
     ]
   }
   ```

   - `key` is the topic slug, lowercase, hyphenated, written once.
   - `id` is short, stable and unique across the whole deck (`s1`, `s2`, …).
   - Every card gets both `q` and `a`; a card without a real answer does not belong here.
   - Each answer is 60 to 140 words, one idea per card, and uses `**phrase**` once or
     twice to mark the load-bearing term or claim. Use plain paragraphs — the block tokens
     `Diagram:`, `Flow:`, `Tree:` and `_aside_` are available for a card that genuinely
     needs one, each on its own line, but most cards need none of them.
   - Prefer facts the reader can check over opinion or paraphrase.

3. **Save the deck** to `<topic-slug>.deck.json` in the current directory.

4. **Run the link script:**

   ```bash
   node "${CLAUDE_PLUGIN_ROOT}/skills/own-words/link.mjs" <topic-slug>.deck.json
   ```

   It validates the file and prints the link on success, or a one-line reason and a
   non-zero exit on failure — fix the deck and run it again rather than guessing.

5. **Reply with the link and the card count, nothing else.**

## Quality bar

- No card whose answer is a list of the words already in the question.
- No yes/no questions — every question asks for an explanation, a comparison, a mechanism
  or a number, never a fact he can answer without thinking.
- Every card is answerable on its own, without having read the card before it.
