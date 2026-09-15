/* The landing page's deck-text parser.
 *
 * The engine's own copy of this lives in core/shell.js (`parseDeck` + the first check in
 * `loadFromText`), but the landing cannot load the engine: core/shell.js boots on load and
 * empties document.body, which is the whole landing. So the two paragraphs of parsing the
 * paste box needs are kept here, in one file that is both a <script> on the page and a
 * require() in node, so the same code the button runs is the code the test runs.
 *
 * Accepts the deck as JSON, or as the `window.DECK = {...};` file an author actually writes.
 * Returns { ok: true, deck } or { ok: false, why }, where `why` is the text shown under the
 * box. The wording is the engine's own, from core/strings.en.js.
 */
(function (root, factory) {
  if (typeof module === "object" && module && module.exports) module.exports = factory();
  else root.OwnWordsParse = factory();
})(typeof self !== "undefined" ? self : this, function () {
  var BAD_TEXT = "the deck text will not parse: ";
  var NOT_A_DECK = "this is not a deck: the text has neither key nor blocks";

  function parseDeckText(text) {
    var body = String(text == null ? "" : text).replace(/^﻿/, "").trim();
    if (!body) return { ok: false, why: NOT_A_DECK };

    // The prefix is stripped and the rest read as data first; only when that fails is the text
    // run as code, because a deck file may legitimately be JS and a pasted deck is text the
    // reader chose to open.
    var bare = body.replace(/^(?:window\s*\.\s*)?DECK\s*=\s*/, "").replace(/;\s*$/, "");
    var deck = null, read = false;
    try { deck = JSON.parse(bare); read = true; } catch (e) { /* not JSON; try it as JS */ }

    if (!read) {
      try {
        var box = {};
        new Function("window", body + "\n;return window.DECK;")(box);
        if (!box.DECK) return { ok: false, why: NOT_A_DECK };
        deck = box.DECK;
      } catch (e) {
        return { ok: false, why: BAD_TEXT + (e && e.message ? e.message : String(e)) };
      }
    }

    if (!deck || typeof deck !== "object" || (!deck.key && !deck.blocks)) {
      return { ok: false, why: NOT_A_DECK };
    }
    return { ok: true, deck: deck };
  }

  return { parseDeckText: parseDeckText, NOT_A_DECK: NOT_A_DECK, BAD_TEXT: BAD_TEXT };
});
