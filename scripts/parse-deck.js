/* The landing page's deck-text parser.
 *
 * The engine's own copy of this lives in core/shell.js (`parseDeck` + the first check in
 * `loadFromText`), but the landing cannot load the engine: core/shell.js boots on load and
 * empties document.body, which is the whole landing. So the two paragraphs of parsing the
 * paste box needs are kept here, in one file that is both a <script> on the page and a
 * require() in node, so the same code the button runs is the code the test runs.
 *
 * What arrives in the box is a chat reply, not a file: a sentence of preamble, a ``` fence, the
 * deck, and an offer to write more cards. So the fences go first, then the text is cut from its
 * first { to its last } and only that is parsed - as JSON, and failing that as the JavaScript a
 * `window.DECK = {...};` deck file really is, the assignment having been cut away with the rest.
 *
 * Returns { ok: true, deck } or { ok: false, why }, where `why` is the text shown under the box.
 */
(function (root, factory) {
  if (typeof module === "object" && module && module.exports) module.exports = factory();
  else root.OwnWordsParse = factory();
})(typeof self !== "undefined" ? self : this, function () {
  // The landing's own wording, not the engine's: the engine is handed a deck file and can say
  // the text will not parse, while the box is handed a conversation and has to say where in it
  // the deck begins and ends.
  var NO_JSON = "I could not find deck JSON in that. Paste from the first { to the last }.";
  // The engine's own, from core/strings.en.js: something was read, and it is not a deck.
  var NOT_A_DECK = "this is not a deck: the text has neither key nor blocks";

  function parseDeckText(text) {
    // Whole lines that are nothing but a ``` fence, language tag and all. Anything outside the
    // braces is dropped by the cut below anyway; this is here so a fence can never end up inside
    // the slice when a reply opens one and forgets to close it.
    var body = String(text == null ? "" : text)
      .replace(/^﻿/, "")
      .replace(/^[ \t]*```[^\n]*$/gm, "");

    var from = body.indexOf("{");
    var to = body.lastIndexOf("}");
    if (from < 0 || to < from) return { ok: false, why: NO_JSON };
    var slice = body.slice(from, to + 1);

    // Data first, code only when the data reading fails: a deck may legitimately be JS - unquoted
    // keys, comments, a trailing comma - and a pasted deck is text the reader chose to open. It
    // is still eval, and it is still the first screen a stranger meets, which is worth saying out
    // loud rather than burying.
    var deck = null;
    try {
      deck = JSON.parse(slice);
    } catch (notJson) {
      try {
        deck = new Function("return (\n" + slice + "\n);")();
      } catch (notJs) {
        return { ok: false, why: NO_JSON };
      }
    }

    if (!deck || typeof deck !== "object" || (!deck.key && !deck.blocks)) {
      return { ok: false, why: NOT_A_DECK };
    }
    return { ok: true, deck: deck };
  }

  return { parseDeckText: parseDeckText, NOT_A_DECK: NOT_A_DECK, NO_JSON: NO_JSON };
});
