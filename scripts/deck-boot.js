/* What deck.html does after the engine has booted.
 *
 * The page carries no window.DECK: it is opened with a deck in hand, one of two ways.
 *
 * `#d=` is read by the engine itself at boot, so the deck is already on screen by the time this
 * runs; handing the same JSON to OwnWords.loadFromText only files it under its key, so a deck
 * that arrived inside a link turns up in "My decks" on the landing afterwards.
 *
 * `?k=` is the landing's link to a deck already filed. The engine has no notion of it - it
 * resolves window.DECK or the hash and nothing else - so the key is turned back into a deck
 * here, through the engine's own OwnWords.open.
 */
(function () {
  if (!window.OwnWords) return;

  var byKey = /[?&]k=([^&]+)/.exec(window.location.search || "");
  if (byKey) { window.OwnWords.open(decodeURIComponent(byKey[1])); return; }

  var byHash = /[#&]d=([^&]+)/.exec(window.location.hash || "");
  if (!byHash || typeof LZString === "undefined") return;
  try {
    var json = LZString.decompressFromEncodedURIComponent(byHash[1]);
    if (json) window.OwnWords.loadFromText(json);
  } catch (e) { /* the deck is already drawn; only the filing under its key is lost */ }
})();
