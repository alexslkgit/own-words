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
 *
 * With neither of the two in the link the page was opened by hand, and there is nothing to show.
 * The engine has already printed its own empty-deck message underneath, which reads like a fault;
 * the panel below replaces it with the one thing that is true - this link carries no deck.
 */
(function () {

  // A `?k=` link is only ever written by "My decks" on the landing, out of this browser's own
  // localStorage, so the one way to arrive here with a key the engine cannot find is to have
  // brought the link somewhere else: another browser, another profile, or the same one after its
  // site data was cleared. The engine's answer to that is its empty-deck message, which reads as
  // if the deck were broken. It is not; it is elsewhere, and only two things bring it back.
  //
  // `lede` is the one line that differs between that and a link with no deck in it at all.
  function missing(lede) {
    // landing.css is deliberately not linked by deck.html: its button, h1 and h2 rules would
    // repaint the engine's own chrome on every deck page. It is pulled in here only, on a page
    // that is about to be nothing but this panel.
    var css = document.createElement("link");
    css.rel = "stylesheet";
    css.href = "landing.css";
    document.head.appendChild(css);

    var wrap = document.createElement("main");
    wrap.className = "wrap";

    var title = document.createElement("h1");
    title.textContent = "own-words";
    wrap.appendChild(title);

    var said = document.createElement("p");
    said.className = "lede";
    said.textContent = lede;
    wrap.appendChild(said);

    var list = document.createElement("ul");
    list.className = "decks";
    var row = document.createElement("li");
    var link = document.createElement("a");
    link.href = "index.html";
    var name = document.createElement("span");
    name.className = "name";
    name.textContent = "Open a deck, or paste one";
    var sub = document.createElement("span");
    sub.className = "sub";
    sub.textContent = "The own-words landing page";
    link.appendChild(name);
    link.appendChild(sub);
    row.appendChild(link);
    list.appendChild(row);
    wrap.appendChild(list);

    document.body.innerHTML = "";
    document.body.appendChild(wrap);
  }

  var byKey = /[?&]k=([^&]+)/.exec(window.location.search || "");
  var byHash = /[#&]d=([^&]+)/.exec(window.location.hash || "");

  // Nothing in the link: deck.html is a frame a deck is opened in, never a page of its own. This
  // is checked before the engine is, because a bare deck.html has to say so even if the engine
  // never came up.
  if (!byKey && !byHash) {
    missing("This link carries no deck. Open one from the own-words page, or paste a deck there.");
    return;
  }

  if (!window.OwnWords) return;

  if (byKey) {
    var opened = window.OwnWords.open(decodeURIComponent(byKey[1]));
    if (!opened || !opened.ok) {
      missing("This deck was kept in a different browser. Open its #d= link again, or paste the JSON.");
    }
    return;
  }

  if (typeof LZString === "undefined") return;
  try {
    var json = LZString.decompressFromEncodedURIComponent(byHash[1]);
    if (json) window.OwnWords.loadFromText(json);
  } catch (e) { /* the deck is already drawn; only the filing under its key is lost */ }
})();
