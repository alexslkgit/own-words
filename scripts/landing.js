/* The landing's four behaviours: open a demo deck, open a pasted one, copy the prompt, list the
 * decks this browser has already kept.
 *
 * The engine is deliberately not loaded here. core/shell.js boots as soon as it loads and its
 * render() empties document.body, which is this whole page, so window.OwnWords does not exist on
 * the landing. Everything below therefore hands the deck to deck.html and lets the engine do the
 * work there: the parsing is the shared snippet in scripts/parse-deck.js, and the storage keys
 * are read, never written.
 */
(function () {
  var DECK_PAGE = "deck.html";
  var INDEX_AT = "ownwords:index";

  function byId(id) { return document.getElementById(id); }

  function linkFor(json) {
    if (typeof LZString === "undefined") return null;
    try { return DECK_PAGE + "#d=" + LZString.compressToEncodedURIComponent(json); }
    catch (e) { return null; }
  }

  // ---- the decks that ship with the site ---------------------------------------------------
  //
  // Their hashes are built by scripts/build-links.mjs and loaded as a plain global, because
  // fetch() is refused on file:// and a link that only works over http is not a link. The fetch
  // is the fallback and not the other way round: it is what answers when links.js is missing.
  function wireDemos() {
    var built = window.OWN_WORDS_LINKS || {};
    var said = byId("demo-said");
    Array.prototype.forEach.call(document.querySelectorAll("a[data-deck]"), function (a) {
      var name = a.getAttribute("data-deck");
      if (built[name]) { a.href = DECK_PAGE + "#d=" + built[name]; return; }
      a.href = "decks/" + name + ".json";
      a.addEventListener("click", function (ev) {
        ev.preventDefault();
        said.textContent = "";
        fetch("decks/" + name + ".json").then(function (r) { return r.text(); }).then(function (text) {
          var href = linkFor(JSON.stringify(JSON.parse(text)));
          if (!href) throw new Error("no packer on the page");
          window.location.href = href;
        }).catch(function () {
          said.textContent = "This deck could not be opened. Run scripts/build-links.mjs to rebuild the links.";
          said.className = "said bad";
        });
      });
    });
  }

  // ---- a deck the reader pasted -------------------------------------------------------------
  function wirePaste() {
    var box = byId("paste");
    var said = byId("paste-said");
    byId("paste-open").addEventListener("click", function () {
      var read = window.OwnWordsParse.parseDeckText(box.value);
      if (!read.ok) { said.textContent = read.why; said.className = "said bad"; return; }
      var href = linkFor(JSON.stringify(read.deck));
      if (!href) { said.textContent = "This deck cannot be opened: the packer did not load."; said.className = "said bad"; return; }
      said.textContent = "";
      said.className = "said";
      window.location.href = href;
    });
  }

  // ---- the prompt ---------------------------------------------------------------------------
  //
  // The textarea is the fallback in itself: it is on the page and selectable, so a browser that
  // refuses the clipboard still leaves the reader something to copy by hand.
  function wirePrompt() {
    var box = byId("prompt");
    var said = byId("prompt-said");
    byId("prompt-copy").addEventListener("click", function () {
      box.focus();
      box.setSelectionRange(0, box.value.length);
      function ok() { said.textContent = "Copied."; said.className = "said"; }
      function no() { said.textContent = "Copying was refused. The text is selected, so press the copy key."; said.className = "said bad"; }
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(box.value).then(ok, function () {
          try { document.execCommand("copy") ? ok() : no(); } catch (e) { no(); }
        });
        return;
      }
      try { document.execCommand("copy") ? ok() : no(); } catch (e) { no(); }
    });
  }

  // ---- what this browser has kept -----------------------------------------------------------
  function wireMine() {
    var list = [];
    try { list = JSON.parse(window.localStorage.getItem(INDEX_AT)) || []; } catch (e) { list = []; }
    if (!list.length) return;
    var into = byId("mine-list");
    list.forEach(function (entry) {
      if (!entry || !entry.key) return;
      var li = document.createElement("li");
      var a = document.createElement("a");
      a.href = DECK_PAGE + "?k=" + encodeURIComponent(entry.key);
      var name = document.createElement("span");
      name.className = "name";
      name.textContent = entry.title || entry.key;
      a.appendChild(name);
      li.appendChild(a);
      into.appendChild(li);
    });
    if (into.children.length) byId("mine").hidden = false;
  }

  wireDemos();
  wirePaste();
  wirePrompt();
  wireMine();
})();
