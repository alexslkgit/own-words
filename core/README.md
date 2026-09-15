# The deck contract, new engine

What a deck author writes, and what the reader's browser keeps. This is the contract the
screens are built against; it replaces the old `README.md` for decks that run on `core/`.
The old engine (`app/`) and every deck already running on it are frozen and unaffected.

## What the author writes

```js
window.DECK = {
  key: "raads",              // written once, NEVER changed: a new key is an empty bucket
  round: 3,                  // this round's number; his answers are kept per round
  title: "…",
  copyPrefix: "…",           // the short human name of the deck: it heads the sent form
                             // AND the page header. Defaults to title; the key is never shown.
  gate: true,                // deck-wide default: is a prepared answer hidden until he answers

  from: [{ round: 3, t: "…" }],   // the assistant's word about the round as a whole; shown at
                                  // the top of every card as «from Claude · round N»

  scales: {                  // declared once, referred to by name
    epworth: { labels: ["never", "slight", "moderate", "high"], note: "…" }
  },

  marks: [                   // the deck declares its own; the engine hard-codes none
    { id: "back",  label: "back",   side: "mine", key: "1" },
    { id: "done",  label: "closed", side: "done", key: "3" }
  ],

  blocks: [
    { n: 1, t: "…", min: "10 minutes", note: "…",
      q: [
        { id: "s1",          // short, stable, unique across the deck
          q: "the question",
          tag: "eyebrow above the answer",
          a: "the prepared answer",        // absent = there is no right answer
          n: "notes: his own questions answered, terms explained",       // absent = no such block
          gate: false,                     // per-card override of DECK.gate
          d: "material",                   // an extra plain block under the answer
          reply: { mode: "scale", scale: "epworth" },   // or "text" | "choice" | "none"
          from: [{ round: 2, t: "the assistant's reply to his answer of that round" }],
          ref: ["author's notes"]          // never rendered, never sent
        }
      ] }
  ]
};
```

**A card the reader cannot use is dropped, not shown broken.** No `id` means his answer has
nowhere to go; no `q` means there is nothing to answer; a repeated `id` means the second card
would silently share the first one's record. All three are skipped, counted in `model.skipped`,
and named in `errors`. The band on screen says how many were lost and how many loaded. A deck
where nothing at all loads gets the whole card area instead of an empty one.

**Marks.** `side: "mine"` is his side of the line, `side: "done"` is closed. A deck with no
right answer simply never declares a mark meaning «I know it», so the label cannot lie. The
universal «touched / not touched» is computed, never stored and never declared.

**Dead fields.** `code`, `dia` and `dia2` are read and hashed but nothing renders them: they
were the old engine's code sample and its two diagram slots. A diagram now lives inside `a`
(see the markup below), which is the only place it can be aligned. `rev`, `nu`, `seed` and `job`
never existed here at all. Nothing new should be written into any of them.

**«Discuss» is not a mark, and no longer a button either.** Something written in the one field
is the whole of «there is something to discuss»: there is no flag to raise and none over an
empty box. The `discuss` field still exists in the record so buckets written before this, and
buckets brought across by `adopt()`, keep reading.

**The thread has two halves.** His messages live in the record (`msgs`), the assistant's in
`from` on the card. A reply in `from` for the current round is what folds his own answer away
(`M1`): he does not want to re-read himself every time, but the fold opens.

**No `rev`, no `nu`, no `seed`.** His half never enters `data.js` again. The author rewrites
his own half whole each round and bumps `round`.

## The two blocks of a card, and which one is on top

The body of a card is `a` and, above it, `n`.

| written | is | where |
|---|---|---|
| `a` | the direct answer to the question on the card | the lower block, always |
| `n` | the notes: the answers to his questions about that answer, and the terms in it | the upper block, only when it is written |

They are two boxes and not one column, because one column is what this replaced: the answer to
the card mixed in with the side answers until neither could be found. The notes stand above
because they are what he asked about last and what he is coming back to read; the answer stands
under them because it is the thing the card is, and the thing that is still there when he
scrolls. 16 px between them, the same 18 px above the first of them as any block of the card.

The upper block is drawn in a tint of its own — the answer is warm neutral, «from Claude» is warm
accent, the notes are the cool one — and is the only box on the card that wears a name, a small
muted «Notes». It carries one because it is the exception: the answer needs no label, since
the card is the answer, while a block of side answers standing over the answer does have to say
what it is.

`n` takes exactly the markup `a` takes — paragraphs, `Diagram:`, `Flow:`, `Tree:`, pills,
`_asides_`, and a pointer at another card. Both are rewritten whole by the author every round
and never appended to; neither one ever travels in the sent form.

**The gate covers both.** Behind a shut gate the notes are not drawn at all: they are written
about an answer he has not been shown yet, and half of them give it away.

**`n` is in the stamp,** so a rewritten note is «new in this round» exactly like a rewritten
answer. It joins the stamp only when it is actually written, so every card that carries no `n`
hashes to the number it hashed to before the field existed — a stamp that shifted by one
separator would have turned every card of every deck new on the next load. `core/selftest.js`
pins that number.

**`n` has no say in the form.** The four forms are derived from the answer, the gate and the way
he answers; a card is `recall` or `read` because of `a`, never because something was
explained above it.

## The four forms, derived and never declared

| prepared answer | gate | reply | form |
|---|---|---|---|
| yes | on | not `none` | **`recall`** |
| yes | off | any | **`read`** |
| yes | on | `none` | **`read`** (a gate with nothing to pass is a bug, not a form) |
| no | n/a | not `none` | **`self`** |
| no | n/a | `none` | **`talk`** |

## The markup of a prepared answer

`a` is written in six rules and nothing else is markup. The model returns a tree of runs, never
a string of HTML, and the shell turns it into text nodes, so an author's text has no path to
`innerHTML`.

| written | means |
|---|---|
| a blank line | a paragraph break |
| `**phrase**` | the one or two phrases that carry the card |
| `_phrase_` | the aside, the part he may skip |
| a line that is exactly `Diagram:` | opens a monospace block, closed by the next blank line |
| a line that is exactly `Flow:` | opens a drawn flow, closed by the next blank line |
| a line that is exactly `Tree:` | opens a drawn decision tree, closed by the next blank line |

The tokens in the active strings table also work: a table may name its own spelling of the three
under `blockTokens`, and a deck written in those parses exactly as it always did.

Everything inside a `Diagram:` block is kept character for character, so columns line up: that is
the only place alignment is preserved. The heading line must be exactly `Diagram:`, nothing else
on it, or it is ordinary prose. The same is true of the two headings below: a line that only
*begins* with `Flow:` is a sentence.

### Tags, and the colour they carry

Four tags, and nothing else is a tag: `[iOS]` blue, the server tag orange, the network tag
green, the database tag purple. The last three are spelled in the language the decks are written
in; their literals live in `TAGS` in `core/model.js`, written as `\uXXXX` escapes for the same
reason every other such literal there is. Anything else in brackets reads as untagged and draws
neutral grey, because one mistyped tag must not stop a diagram from drawing.
`DeckModel.tagKey(raw)` gives `"ios"`, `"srv"`, `"net"` or `"db"`, and `""` for a word that is
not one of the four.

A tag works in two places. In a diagram it prefixes a node and paints its box: the tag's own
word is never printed, the colour is what it says, and it is on `title` so hovering recovers it.
In a sentence, `**[iOS]**`, a tag alone inside bold, draws as a coloured pill instead of a
bold phrase, brackets and all. Plain `**bold**` is still plain bold.

### `Flow:`, boxes and arrows

Each line after the heading is one row. Nodes are separated by ` -> ` (space, arrow, space); a
node is plain text with an optional `[tag]` in front of it; a label on an arrow is written in
braces right after it. A line starting with two spaces is a branch and draws indented, hanging
from an elbow.

```
Flow:
[iOS] phone -> {60 ms} CDN -> balancer -> Postgres
  balancer -> {miss} replica
```

(`CDN`, `balancer` and `Postgres` stand untagged here only so the example carries no literal
from the decks' own language; in a real answer each of them wears one of the three tags above.)

**A branch says where it comes from by repeating that node,** and the repeat is drawn as a
ghost: dashed, pale, unfilled, «the same node as the line above» on hover. The node is looked for
anywhere in the row above, not only at its end, and it has to match in both word and tag: the
same word under another tag is another box. Drawn like an ordinary node the repeat reads as a
new box, and the whole branch then reads as an arrow out of whatever stood first in the row
above; `ghost: true` on that node in the parsed row is what the screen draws from, so the check
is a check on the model and needs no browser. A branch whose first node repeats nothing, or that
is one node long, marks nothing.

Rows wrap rather than scroll sideways: each arrow is glued to the node it points at, so a row
too wide for the card breaks between pairs and no arrow is ever left pointing at a line end.

### `Tree:`, a decision tree

Two spaces of indent per level. A line ending in `?` is a question and draws bold with a «?»
chip. A line of the shape `<condition> -> X` is a branch: the condition is the quiet word, `X` is
a box and takes a tag like any other node. Any other line is plain text at its level.

```
Tree:
Are the data needed offline?
  yes -> a local database
    Are there many of them?
      yes -> SQLite
      no -> [iOS] UserDefaults
  no -> go to the server every time
```

A level is a real nesting, not an indent: the guide line down the side of a branch is that
branch's own left border, so it starts and stops exactly where the branch does.

### A pointer at another card

Nothing is written for this: the author points at a card the way he always did — the word for a
card, in one of three endings, then NN — and the shell turns that inside a prepared answer into a
control that opens card NN. NN is the number on the cell in the rail, the only number of a card
the reader has ever been shown. The pattern is `CARD_REF` in `core/model.js`, written in `\uXXXX`
escapes like every other literal there. `DeckModel.refSplit(run)` is the whole of the decision
and it is checked without a browser: three endings and no others, so the genitive and the counted
form stay prose, a bare number stays a number, a word that merely ends in the pointer word points
at nothing, and a number no
card carries is left as the text it is — a broken link is worse than a sentence. A pointer written
inside `_…_` stays an aside; one written inside `**…**` is left alone, because a bold run is
already a marker and may be a tag.

Following one **marks nothing at all**, on either card: it is not an answer, not a mark, and not a
leave, so the set of blocks he has read is untouched by it. For the length of that visit a small
`← back to NN` stands on the card's header line; the next move he makes by any other means ends
the visit and takes it away.

### Air

A paragraph is 14 px under the one above it, a block of the card 18 px, and every diagram takes
16 px above and below, never doubled at the ends, where the box around the answer already pads.

An unmatched `**` or `_` stays the literal character it is: a half-typed marker must look like a
typo, not eat the rest of the card. The `_` rule is narrow at the opening end so Swift survives it
and wide at the closing end so Russian does. An **opener** stands at the head of a line, after
whitespace, or just inside `«`, `(` or `"`, and has a non-space behind it. A **closer** has
anything solid in front of it (a letter, a digit, `%`, `»`, a full stop) except those same three
brackets, and behind it nothing but the end of the line, whitespace, or one of
`.` `,` `;` `:` `!` `?` `)` `»`. So `os_signpost`, `user_id`, `func set(_ k:` and `report(_:)` all
pass through untouched, `report(_:)` beside `setOverlay(_:)` does not pair the two brackets up,
and `_You said: 2%_.` is the aside it was written as instead of a literal underscore at the head
of a sentence.

Answers written before this renders the same as it always did: plain lines, blank lines between
paragraphs, diagram headings. Nothing has to be migrated.

```js
DeckModel.markup(text)
// [ { kind: "p",   lines: [ [ { t: "text", b: false, i: false } ] ], src: "text" },
//   { kind: "dia", head: "Diagram:", lines: [ "1M DAU -> 115 rps" ],
//     src: "Diagram:\n1M DAU -> 115 rps" } ]
```

`src` is the block's own source, trimmed, and it is what a per-block hash is taken of — see
«the blocks he has read» below.

## The four ways to answer

`text` (default) · `scale` (a deck-declared scale, stored as the index of a label) ·
`choice` (`options`, plus `many: true` for several) · `none`.

## What the browser keeps

One `localStorage` key, one JSON object:

```js
{ v: 2,                         // schema; a bucket below it is migrated once, on load
  cards: { "s1|3": { … } },     // key = question id + "|" + round number
  extra: { "3": "free-form box for that round" },
  prefs: { theme: "…", review: false },   // review = «repeat everything», per deck
  flags: { "s1": { prio: false, diff: true } },     // per card, NOT per round
  read: { "s1": ["a1b2c3d4", "…"] } }               // per card, NOT per round
```

Per record:

| Field | Meaning |
|---|---|
| `my` | his final wording for this round |
| `draft` | what he is still typing |
| `val` | the value for a scale or a choice |
| `mark` | one deck-declared mark id, or `null` |
| `discuss` | dead: the old «discuss» flag, still read, never raised again |
| `msgs[]` | his own messages, `{t, at}`; the assistant's half never travels here |
| `told` | how he passed the gate: `"my"` or `"skip"` |

The sent form prints an unsent `draft` too, prefixed «(draft, not sent)»: a card he typed on and never passed through the gate is otherwise a «1 answer» line over nothing.
| `sent` | the round in which this record was last included in a send |
| `seen` | the stamp of the authored half of the card as he last saw it |
| `qs` | the question as it was worded when he answered it |
| `at` | last write, milliseconds |

**Two flags per card, and they outlive the round.** `flags[id]` holds `prio` and `diff`, and
`store.flag(id, name, value)` is the whole api: `undefined` reads, `null` clears, a boolean
sets. Both are three-valued on purpose (unset, `true`, `false`) because «not decided» and
«decided to put it off» are different things and only the second one may put a card aside.

| flag | `true` | `false` | unset |
|---|---|---|---|
| `prio` | priority | set aside | not decided |
| `diff` | hard | not hard | not decided |

**The screen offers two of those five cells and no more.** There are two pills under the card,
«set aside» and «hard», each on or off, and neither ever renames itself: a control whose label
changes is two controls wearing one button. «set aside» on writes `prio === false` and off clears
the flag back to unset, so «not decided» survives; `prio === true` has no button any more and is
never written from the screen. «hard» on writes `diff === true` and off clears it the same way.
A bucket written earlier that holds `prio === true` still reads, and still means «not set aside»,
which is what it always meant.

**The blocks he has read, and the indent they earn.** He rereads whole cards because nothing on
one says which part of it he has seen before. The rule is the one code uses: a block of the answer
he has already been shown is indented 20 px and dropped to .6 opacity (`.seen`), and a block that
is new or rewritten stays flush left at full contrast. The unit is a block of `markup()` — a
paragraph, a `Diagram:`, a `Flow:`, a `Tree:` — and never a line or a card.

```js
DeckModel.blockHashes(card.answer)   // one hash per block of one field, in the order they render
DeckModel.cardHashes(card)           // both blocks of the card: `n` first, then `a`
store.readBlocks(id)                 // the set recorded at the last arrow
store.markRead(id, hashes)           // write it whole
store.marksRead(route)               // does this way out of a card record it: "arrow" and no other
store.leaveRead(id, hashes, route)   // the leave: markRead, but only on a route that records
store.wasRead(id, hash)              // the whole of what `seen` means on screen
store.forgetRead()                   // «reset what you have read» in the settings panel
```

A block's hash is `DeckModel.stamp` of that block's own trimmed source — the same hash the card's
stamp is made with, because «this piece changed» and «this card changed» are one question
asked of two sizes of text. `markup()` puts that source on every block as `src`, and the hashes
are taken from there rather than from a second split on blank lines: a `Diagram:` heading opens a
block with no blank line in front of it, so a naive split would hash text the screen never drew
as one thing.

**One set per card, not one per field.** `cardHashes` is what the leave records, and it puts the
notes first because that is the order they are drawn in — the order lives in the model so
«above the answer» is checked without a browser. A block the author moves out of `a` and up into `n`
word for word keeps its hash and goes on reading as seen, which is the whole reason the set is
not split by field. The same indent-and-dim applies inside both boxes.

**The set is written once, when he presses the arrow,** and it is written whole: the hashes of the
text as it stood at that moment, nothing older. That is the bound — it can never be longer than
the number of blocks on the card. A rewritten block falls out of it by itself, because the old
hash is no longer in the text and the new one was never recorded, which is exactly what makes the
rewrite read as new.

**Only one gesture records, and it is his.** A card counts as read when he goes on to the next one
through the `›` on the card, which is the same press that writes his answer; `store.marksRead`
holds that closed list of routes and `"arrow"` is the only name in it. Opening a card, a cell in
the rail, the search, a pointer in the prose, `×`, «reread», `J` and `K`, and closing the page
record nothing at all. Two guards sit on top of that: the card the page merely **opened on** is
not a card he arrived at, and a card left with the **gate still shut** showed no answer, so
nothing is recorded and, just as important, nothing is cleared. The rule was twice a side effect
of navigation instead, first any card walked past and then any card he had typed in, and both
times he came back to a deck where every card was dimmed and nothing said what he still had to
read.

It is per card and never per round, beside `cards` for the same reason `flags` is. It rides in
the export file, which is his only backup of this browser, and it is nowhere in the sent form: a
list of hashes is a note about what he looked at, not a word he wrote. A merge fills in only the
cards this browser has never recorded — merging two sets would be the one way this can grow
without bound. An older bucket with no `read` key reads as nothing-read.

**The wipe at `v: 2`.** A bucket written under an older schema carries read sets made by the old
rule, and fixing the rule cannot undim them: it stops new marks and leaves the wrong old ones
standing, which is a deck that still comes up read from end to end. So the first load under
`SCHEMA = 2` drops `read` whole and writes the new number back in the same breath, once per
browser. Read sets and nothing else: answers, drafts, marks, messages, toggles, prefs and the
free-form box all come across untouched. This is the only migration the store performs, and the
next one has to be a decision of the same size.

`store.setAside(id)` is `diff === true || prio === false`, and that is exactly what the
«set aside» filter shows. The normal queue ignores both flags: a card he called hard still
comes round, it is simply findable as a group. They sit outside `cards` because a decision about
a card is about the card, not about the round it was made in, and a new round must not silently
forget it. An older bucket with no `flags` reads as all-unset, and an older engine ignores the
key it does not know, so nothing is lost in either direction.

## The queue, and what «reread» does to it

The queue is derived in `store.js` and nowhere else, so it can be checked without a browser. It
is given the *side* of the mark the card carries and never a mark id, because the deck declares
its own marks and the engine must not know one by name.

```js
store.wrote(id)            // his own words this round: `my` or `draft`, trimmed
store.reread(id, side)     // side === "mine" && !wrote(id)
store.hidden(id, side)     // reread(id, side) && !review()
store.review(on)           // read, or turn «repeat everything» on; kept in this deck's prefs
store.inQueue(id, side)    // the whole of what «in the queue» means
```

| the card carries | in the queue |
|---|---|
| a `side: "done"` mark | no, for good |
| a `side: "mine"` mark, nothing written | **no**, and hidden: the cell greys and strikes through |
| a `side: "mine"` mark, something written | yes, and the sent form does not call it a reread |
| `told === "skip"` with no answer | yes |
| anything else | only if he has not touched it |

**Hidden is derived, never stored.** `hidden = reread && !text.trim()`. Pressing ↻ always records
the mark, so nothing he did is lost; what the empty field decides is only whether the card is
being offered to him right now. The moment he types into it the card is back, with the mark still
on the record, and «reread» over an answer he has already written is not printed in the sent
form at all: he pressed it to read the reply first, not to say he failed the card.

**«Repeat everything»** is one fixed-label toggle in the rail's footer, with the number of hidden
cards beside it. On, every hidden card is back in the queue and every cell is normal again;
closed cards stay closed, because review is about what he put off, not about what he finished.
It is a `prefs` entry, so it is per deck and survives the reload, and it is off screen entirely
when nothing is hidden and the mode is off.

Both the number in the rail's header and the per-stack counts read `inQueue`, so they exclude
hidden cards unless review is on. `J` and `K` walk past a hidden card the same way «Next»
skips it. Clicking its cell still opens it: hiding a card from the queue is not hiding it.

**Rounds.** A previous round is simply an older key. Nothing is overwritten and nothing is
hand-copied into `data.js`, which is what `norm()` and `msgsOf()` used to exist to hide.

**«New in this round»** is `seen !== card.stamp`, where the stamp is a hash of everything the
author wrote on that card. No `rev` bookkeeping, and no mark is ever destroyed to raise the
badge: the mechanism that cost 34 «reread» marks on `mayflower-final` is gone rather than fixed.

**«was · round N».** When the author rewrites a question, the deck file carries the new wording
only. The old one survives because `see(id, stamp, question)` photographs the question at the
moment he answers it, into `qs` on that round's record. `asked(id, nowText)` hands back the
newest earlier round whose photograph differs. Nothing is asked of the author, and the round
summary counts «rewritten» from the same source. «New» is deliberately not counted: a card he
never opened is indistinguishable from a card that did not exist, and a number nothing on disk
supports does not go on screen.

**Undo is one step and lives in memory.** `put(id, record)` writes a record back verbatim,
timestamp included, and `put(id, null)` removes one that did not exist before the action. He
undoes a misclick, not a session, so nothing about it is persisted.

**Failed writes are reported.** A full quota used to be swallowed; `onError("write", e)` now
fires, because that is the one condition under which his answers silently stop being saved.

## Moving an old deck across

`store.adopt(oldBucket, round, mapMark)` reads a bucket written by the old engine and lays it
down as round-keyed records: `status` maps onto a declared mark through `mapMark`, `talk`
becomes the `discuss` flag, and only his own messages travel. It never writes to the old key.

## Checking it

```bash
node core/selftest.js
```

324 checks, no browser and no dependencies. Real decks are never opened for testing, because every
load writes into his real storage. `decks/_lab/` exists for that, and its two deliberate
errors are what the deck-error screen is built against.
