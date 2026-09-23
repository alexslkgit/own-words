// The shell: header, left rail, card frame, bottom strip. It renders from the model and the
// store and owns navigation; what happens inside the card belongs to the next unit.
(function () {
  "use strict";

  // Every user-visible string is a key looked up in core/strings.*.js through this one accessor.
  var S = null;

  var model = null;
  // Declared before the store: create() can report an old bucket synchronously, before `store`
  // exists, and rendering then left a blank page.
  var failed = null;
  var store = null;

  var cur = 0;
  var openBlock = null;

  // ---- the three stops: how much of the deck the time he has is worth ---------------------
  //
  // Three positions and no fourth: the whole deck, what matters, only what matters most. The
  // weight each stop cuts at is here and nowhere else, so the deck can be retuned by editing
  // two numbers. The first one is not a number to tune: a stop that lets everything through
  // is what makes the control safe to touch.
  var W_STOPS = [0, 60, 85];
  // One title per stop, in that order. They live in a tooltip and never on the header line:
  // a word beside the control is a word that changes width, and that is what used to drag it
  // left and right under his finger.
  var W_TITLES = ["w_stop_all", "w_stop_mid", "w_stop_top"];

  // His position, 0 to 2, and the only thing written to disk. It lives in a key of its own
  // beside the deck's bucket and never inside it: the store performs exactly one migration and
  // that migration throws `read` away, so a number about what is on screen has no business
  // riding in the object his answers live in, and nothing in the export file, the import or the
  // wipe has to learn about it.
  var wPos = 0;
  // The ids that arrived on the last move. Consumed by the render that draws them, so the mark
  // flashes once and a redraw for any other reason does not flash it again.
  var wIn = null;
  var wantWFocus = false;
  // Built once, handed back the same object on every render: see weigher().
  var wBox = null;

  function wKey() { return model.key ? model.key + ":w" : ""; }

  // What the cards are filtered against, from the position he is on.
  function wCut() { return W_STOPS[wPos] || 0; }

  // A build before this one wrote the raw 0-100 it had dragged to. Anything past the last
  // position is read as one of those and put back as the nearest stop at once, so the key holds
  // a position after one load. The two values a position and an old level can both be, 1 and 2,
  // are read as a position: after the first load on this build that is the only thing they are.
  function wRead() {
    var k = wKey();
    if (!k) return 0;
    var raw = null;
    try { raw = window.localStorage.getItem(k); } catch (e) { return 0; }
    var n = parseInt(raw, 10);
    if (!(n > 0)) return 0;
    if (n < W_STOPS.length) return n;
    var near = 0;
    for (var i = 1; i < W_STOPS.length; i++) {
      if (Math.abs(n - W_STOPS[i]) < Math.abs(n - W_STOPS[near])) near = i;
    }
    wWrite(near);
    return near;
  }

  function wWrite(n) {
    var k = wKey();
    if (!k) return;
    // A position that cannot be saved is a position he sets again; it is not an answer, so a
    // full quota here says nothing and must not raise the band that says his writing stopped
    // saving.
    try { window.localStorage.setItem(k, String(n)); } catch (e) { /* not his words */ }
  }

  function shows(card) { return DeckModel.shows(card, wCut()); }

  // Nothing written under this key in any round: the deck has just been opened for the first
  // time, and every hint on screen changes for that one visit (S3).
  function isFirst() { return Object.keys(store.raw().cards).length === 0; }

  // Undo is one step and lives in memory only - he undoes a misclick, not a session (M11).
  var undoable = null;

  function remember(id, what) {
    var cur = store.get(id);
    undoable = { id: id, what: what, before: cur ? JSON.parse(JSON.stringify(cur)) : null };
  }

  function undo() {
    if (!undoable) return;
    store.put(undoable.id, undoable.before);
    undoable = null;
    render();
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }
  function st(node, styles) { node.setAttribute("style", styles); return node; }
  function add(parent) {
    for (var i = 1; i < arguments.length; i++) if (arguments[i]) parent.appendChild(arguments[i]);
    return parent;
  }
  function pad(n) { return n < 10 ? "0" + n : String(n); }
  function chevron(up) {
    var box = el("div", "cevbox");
    return add(box, el("div", "cev" + (up ? " up" : "")));
  }
  // The scrollbar said two things: how to drag, and that there is more under the edge. The
  // drag is gone with .nosb, so the second has to be said some other way than a bar lying on
  // top of the content: the edge that still hides something fades out over 24px, the edge that
  // hides nothing stays hard, and mid-scroll both fade. It is written as an inline mask rather
  // than a class because which side fades is a fact about scrollTop, not about the element.
  function edgeMask(node) {
    var x = node.getAttribute("data-axis") === "x";
    function paint() {
      var max = x ? node.scrollWidth - node.clientWidth : node.scrollHeight - node.clientHeight;
      var at = x ? node.scrollLeft : node.scrollTop;
      var head = max > 1 && at > 1;
      var tail = max > 1 && at < max - 1;
      var img = "none";
      if (head || tail) {
        img = "linear-gradient(to " + (x ? "right" : "bottom") + ", " +
          "rgba(0,0,0," + (head ? "0" : "1") + ") 0, #000 " + (head ? "24px" : "0px") + ", " +
          "#000 calc(100% - " + (tail ? "24px" : "0px") + "), " +
          "rgba(0,0,0," + (tail ? "0" : "1") + ") 100%)";
      }
      node.style.setProperty("mask-image", img);
      node.style.setProperty("-webkit-mask-image", img);
    }
    node.paintMask = paint;
    node.addEventListener("scroll", paint);
    paint();
  }

  // Every scroller carries the class; the first pass wires it, later passes only repaint.
  function masks(root) {
    [].forEach.call(root.querySelectorAll(".msk"), function (n) {
      if (n.paintMask) n.paintMask(); else edgeMask(n);
    });
  }

  function action(text, onClick, up) {
    var row = st(el("div", "fx ac"), "gap: 7px; cursor: pointer;");
    add(row, el("div", "act", text), chevron(up));
    if (onClick) row.addEventListener("click", onClick);
    return row;
  }

  // ---- theme ------------------------------------------------------------------------

  function applyTheme() {
    var want = store.pref("theme") || "auto";
    var dark = want === "dark" ||
      (want === "auto" && window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches);
    document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
  }
  if (window.matchMedia) {
    window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", applyTheme);
  }

  // ---- what the rail needs to know ---------------------------------------------------

  function cardState(card, index) {
    var s = store.get(card.id);
    var cls = "qn";
    if (index === cur) cls += " cur";
    else if (s && s.told === "skip") cls += " skip";
    else if (store.touched(card.id)) cls += " done";
    if (store.isNew(card)) cls += " nw";
    if (isHidden(card)) cls += " hid";
    if (wIn && wIn[card.id]) cls += " w-in";
    return { cls: cls, discuss: hasWords(card.id) };
  }

  // ---- what is still in the queue ------------------------------------------------------
  //
  // The deck declares its own marks and the engine hard-codes none, so `side` is the only
  // thing that can decide this: "done" is closed for good, "mine" is his side of the line and
  // is the one state that deliberately keeps a card coming back. Everything here reads that
  // field rather than any particular mark id, which is why it works whatever a deck calls them.
  function sideMark(side) {
    return model.marks.filter(function (m) { return m.side === side; })[0] || null;
  }
  var MARK_DONE = null;
  var MARK_AGAIN = null;

  function markOf(id) { return (store.get(id) || {}).mark || null; }
  function markSide(id) {
    var m = model.markById[markOf(id)];
    return m ? m.side : null;
  }

  // The queue itself is derived in store.js, where it can be checked without a browser; all the
  // shell contributes is the side of the mark, because the deck declares its own marks and the
  // engine may not know one by id.
  // The slider is part of «in the queue»: a card it has cut away is not being offered to him,
  // so it is not counted in the rail, not walked to by «Next», and not what the queue filter
  // finds. On a deck with no weights `shows` is true of every card and this is the line it was.
  function inQueue(card) { return shows(card) && store.inQueue(card.id, markSide(card.id)); }

  // «Reread» over an empty card takes it out of the queue and greys its cell; the cell still
  // opens it. Over a card he has already written on it hides nothing. «Repeat everything» brings
  // the hidden ones back, and while that mode is on there is nothing hidden to skip.
  function isHidden(card) { return store.hidden(card.id, markSide(card.id)); }

  function queueCount() {
    var n = 0;
    model.cards.forEach(function (c) { if (inQueue(c)) n++; });
    return n;
  }

  function blockQueue(block) {
    var n = 0;
    block.cards.forEach(function (c) { if (inQueue(c)) n++; });
    return n;
  }

  // The cards of a stack the slider leaves standing, plus the one he is actually on. A pointer
  // in the prose may take him to a card under the level - a broken link is worse than a sentence,
  // so it is followed - and a rail with no current cell anywhere reads as a page that lost him.
  // Every other way into a card already goes through a filtered list.
  function blockShown(block) {
    var here = model.cards[cur] || null;
    return block.cards.filter(function (c) { return shows(c) || c === here; });
  }

  // Something written in the one field is the whole of "there is something to discuss here":
  // there is no separate flag to forget to raise and no flag to leave raised over an empty box.
  function hasWords(id) {
    var r = store.get(id);
    return !!(r && ((r.my && r.my.trim()) || (r.msgs && r.msgs.length)));
  }

  function nextUntouched() {
    for (var i = 1; i <= model.cards.length; i++) {
      var k = (cur + i) % model.cards.length;
      if (inQueue(model.cards[k])) return k;
    }
    return -1;
  }

  // J and K walk the queue and not the file: a card «reread» took out of it is walked past,
  // the same way «Next» skips it. A deck where every card is hidden simply does not move.
  function step(dir) {
    var n = model.cards.length;
    for (var i = 1; i <= n; i++) {
      var k = ((cur + dir * i) % n + n) % n;
      if (shows(model.cards[k]) && !isHidden(model.cards[k])) return k;
    }
    return cur;
  }

  // The card after this one in the file, never one the slider has cut away. It is the fallback
  // under an empty queue and nothing else, which is why it ignores «reread» the way it always did.
  function after(index) {
    for (var i = 1; i <= model.cards.length; i++) {
      var k = (index + i) % model.cards.length;
      if (shows(model.cards[k])) return k;
    }
    return index;
  }

  // Everything that moves to a card comes through here: a cell in the rail, a row of the
  // search, a row of the whole-deck view, J and K, and forward() after an answer.
  //
  // It used to end with `wholeThread = false`, a leftover reset of a flag that the one-field
  // card had already done away with. The file is strict mode, so assigning to a name that was
  // never declared is a ReferenceError, and it was thrown after cur and openBlock were set but
  // before render() was reached. The page therefore showed the state of the click BEFORE the
  // one he had just made, on every single navigation, until some other handler re-rendered.
  // That is the whole of «the site is just buggy»: one dead line.
  //
  // Leaving the send form or the whole-deck view belongs here too: a cell or a stack is the
  // gesture «show me that card», and it has to mean that from whatever is on screen.
  //
  // `quiet` is J and K and nothing else. Every other way in puts the cursor in the box,
  // because every other way in is a decision to deal with that card; J and K are walking past
  // cards, and the cursor landing in the box after the first J was what made the second J do
  // nothing at all (the keydown handler drops single letters while he is typing, which is
  // right, and is exactly why walking must not put him in the box).
  function go(index, quiet) {
    if (index < 0 || index >= model.cards.length) return;
    // A jump through a pointer in the prose is the one way in that leaves nothing behind and
    // takes the way back with it; every other way in ends the visit that way back belonged to.
    // Nothing is marked read on the way out of here: that is the arrow's job, see keepRead().
    if (backWanted) { backTo = backWanted; backWanted = null; }
    else { backTo = null; }
    visited = true;
    cur = index;
    openBlock = model.cards[cur].block;
    openFold = false;
    view = "work";
    if (!quiet) wantFocus = true;
    render();
  }

  function forward() {
    var k = nextUntouched();
    go(k >= 0 ? k : after(cur));
  }

  // Moving the control is the one gesture that can say which cards just arrived, so it is the one
  // place that computes it: the set is taken against the position he came from and it lasts until
  // the next move. A mark left standing from three moves ago is a mark about nothing he remembers.
  function wMove(next) {
    if (next === wPos || next < 0 || next >= W_STOPS.length) return;
    var was = {};
    model.cards.forEach(function (c) { if (shows(c)) was[c.id] = true; });
    wPos = next;
    wWrite(next);
    var came = {}, arrived = 0;
    model.cards.forEach(function (c) {
      if (shows(c) && !was[c.id]) { came[c.id] = true; arrived++; }
    });
    wIn = arrived ? came : null;
    // The card he is on has just been cut away: the deck under him changed, so he lands on the
    // first one still in it rather than reading a card the rail no longer shows. Nothing is
    // recorded by that - only the arrow records, and this is not it.
    if (model.cards[cur] && !shows(model.cards[cur])) {
      for (var i = 0; i < model.cards.length; i++) {
        if (shows(model.cards[i])) { cur = i; openBlock = model.cards[i].block; break; }
      }
    }
    wantWFocus = true;
    render();
  }

  // Following a pointer at another card, and the way back from it. `backTo` lasts as long as
  // that visit: it is set on the jump and cleared by the next move he makes by any other means,
  // because a way back to a card he left three cards ago is a way back to nowhere he remembers.
  var backTo = null;
  var backWanted = null;

  function jump(index) {
    if (index < 0 || index >= model.cards.length || index === cur) return;
    backWanted = { index: cur, n: cur + 1 };
    go(index);
  }

  // Recording keeps him on the card while the gate is still closed: the point of the gate is
  // that the answer is the reward for answering, not the next question.
  function record() {
    var card = model.cards[cur];
    if (!card) return;
    var closed = gateClosed(card);
    // Answering a card is arriving at it, even the one the page opened on: see keepRead().
    visited = true;
    remember(card.id, S("undo_answer"));
    store.answer(card.id, "my");
    store.see(card.id, card.stamp, card.q);
    // The one place in the file that records what a card showed. A shut gate means this press
    // only opened the answer and he has not read it yet, so it stays on the card and marks
    // nothing; the next press is the one that walks away and records.
    if (closed) render(); else { keepRead(card); forward(); }
  }

  // The three things that can happen to a card, each reachable from a button and from a key
  // and going through exactly one of these.
  function closeCard() {
    var card = model.cards[cur];
    if (!card || !MARK_DONE) return;
    var wasDone = markOf(card.id) === MARK_DONE.id;
    visited = true;
    remember(card.id, "«" + MARK_DONE.label + "»");
    store.setMark(card.id, MARK_DONE.id);
    store.see(card.id, card.stamp, card.q);
    // Re-pressing the X re-opens the card; it does not then walk away from it.
    if (wasDone) render(); else forward();
  }

  function rereadCard() {
    var card = model.cards[cur];
    if (!card || !MARK_AGAIN) return;
    remember(card.id, "«" + MARK_AGAIN.label + "»");
    store.setMark(card.id, MARK_AGAIN.id);
    store.see(card.id, card.stamp, card.q);
    render();
  }

  function skipCard() {
    var card = model.cards[cur];
    if (!card) return;
    var closed = gateClosed(card);
    visited = true;
    remember(card.id, closed ? S("undo_dont_know") : S("undo_skip"));
    store.answer(card.id, "skip");
    store.see(card.id, card.stamp, card.q);
    if (closed) render(); else forward();
  }

  // ---- header -------------------------------------------------------------------------

  // Two numbers used to sit here and they were the same kind of noise as a label that names
  // what is already on screen: the queue is counted in the rail, next to the button that acts
  // on it, and «not sent» is counted on the form that sends it.
  function header() {
    var row = st(el("div", "fx ac jb r-head"), "");
    var left = st(el("div", "fx ac"), "gap: 16px;");

    add(left, st(el("div", "tx", isFirst() ? S("head_first_move") : S("head_your_move")),
      "font-size: 15.5px; font-weight: 600; letter-spacing: -.006em;"));

    var right = st(el("div", "fx ac"), "gap: 12px;");
    if (failed) add(right, el("div", "new", S("head_not_saving")));
    add(right, weigher());
    // The name of the deck, not the name of its storage bucket: the key is plumbing.
    add(right, el("div", "lbl", S("head_deck_round", model.copyPrefix || model.key, model.round)));

    return add(row, left, right);
  }

  // The control, in the header's own row, which is 26px of fixed height: nothing it does can move
  // the card under it, and there is no second line for it to grow into. It exists only for a deck
  // whose author weighted it - `model.weighted` is the whole condition - so a deck with no `w`
  // anywhere is the page it was before this was written.
  //
  // It was a range input with the level written beside it, and it shook. Two reasons, both gone
  // here. The words changed width on every step of the drag and shoved the track sideways under
  // the finger holding it, so there are no words: three cells of a fixed size and nothing next to
  // them. And render() empties the body, which destroyed the very control that asked for the
  // redraw - so this node is built once and handed back the same object every time. header()
  // appends it into the fresh page before the wipe, which moves it rather than replacing it, and
  // a move re-cuts the card list around a control that never left his hands.
  function weigher() {
    if (!model.weighted) return null;
    if (!wBox) {
      wBox = el("div", "wrg");
      wBox.setAttribute("role", "group");
      wBox.setAttribute("aria-label", S("w_hint"));
      for (var i = 0; i < W_STOPS.length; i++) add(wBox, stop(i));
      // The arrows worked on the range input and they go on working here: after a move the focus
      // is put back on this control, so the next key he presses has to be about it.
      wBox.addEventListener("keydown", function (e) {
        if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
        e.preventDefault();
        wMove(wPos + (e.key === "ArrowRight" ? 1 : -1));
      });
    }
    wPaint();
    return wBox;
  }

  // One cell. The bar inside it is narrower at every stop to the right, which is the whole of
  // what it has to say: less deck. A glyph would be a word in a language, and this row has none.
  function stop(i) {
    var seg = el("button", "wsg");
    seg.type = "button";
    seg.title = S(W_TITLES[i]);
    seg.setAttribute("aria-label", S(W_TITLES[i]));
    seg.addEventListener("click", function () { wMove(i); });
    return add(seg, el("div", "wbr"));
  }

  // The only thing about the control that a change touches.
  function wPaint() {
    if (!wBox) return;
    for (var i = 0; i < wBox.childNodes.length; i++) {
      var seg = wBox.childNodes[i];
      seg.className = "wsg" + (i === wPos ? " on" : "");
      seg.setAttribute("aria-pressed", i === wPos ? "true" : "false");
    }
  }

  // The band the deck's own file earns for itself (N6). It is not foldable: a deck that lost
  // cards on load is exactly the thing he must not be able to leave collapsed and forget.
  // No line numbers, because data.js reaches the engine as an evaluated object and the line it
  // came from no longer exists - the place in the deck is what can be pointed at honestly.
  function errorBand() {
    var box = st(el("div", "note acc fx col r-band"), "padding: 15px 18px 16px;");

    var head = st(el("div", "fx ac jb none"), "height: 14px;");
    var title = st(el("div", "fx ac"), "gap: 10px;");
    add(title, st(el("div", "acf"), "width: 7px; height: 7px; border-radius: 2px;"),
      el("div", "lbl", S("band_title")));
    var side = st(el("div", "fx ac"), "gap: 12px;");
    add(side, el("div", "lbl",
      (model.skipped
        ? S("band_skipped", model.skipped, S.n(model.skipped, "cards_n")) + " \u00b7 "
        : "") + S("band_loaded", model.cards.length)));
    var open = st(el("a", "act"), "text-decoration: none;");
    open.textContent = S("band_open_file");
    open.href = "data.js";
    open.target = "_blank";
    open.rel = "noopener";
    add(side, open, chevron());
    add(head, title, side);
    add(box, head);

    return add(box, errorRows("margin-top: 12px;"));
  }

  function errorRows(extraStyle) {
    var rows = st(el("div", "fx col none"), (extraStyle || "") + " gap: 6px;");
    model.errors.forEach(function (e) {
      var line = st(el("div", "fx"), "gap: 12px; align-items: baseline;");
      add(line, st(el("div", "pill", e.where), "flex: none;"),
        st(el("div", "bd14", e.what), "flex: 1 1 auto;"));
      add(rows, line);
    });
    return rows;
  }

  // A deck with nothing loadable in it: there is no card to fall back to, so the errors take
  // the whole card area instead of sitting above an empty one.
  function brokenFrame() {
    var box = st(el("div", "card grow"), "padding: 24px 40px;");
    var head = st(el("div", "fx ac jb none"), "height: 26px;");
    add(head, el("div", "lbl", S("broken_title")),
      el("div", "lbl", model.skipped
        ? S("band_skipped", model.skipped, S.n(model.skipped, "cards_n"))
        : ""));
    add(box, head);
    add(box, st(el("div", "sf q none", S("broken_lead")),
      "font-size: 26px; line-height: 1.34; margin-top: 16px; max-width: 900px;"));
    add(box, st(el("div", "hint none", S("broken_note")),
      "margin-top: 10px;"));
    var rows = errorRows("margin-top: 16px; overflow-y: auto;");
    rows.className = "fx col grow nosb msk";
    return add(box, rows);
  }

  // ---- search and filters -----------------------------------------------------------------

  var query = "";
  var filterId = null;
  var filterOpen = false;
  var wantSearchFocus = false;

  // Built on each call rather than once at load: this file runs before the table is on the page.
  function filters() {
    return [
      { id: "untouched", t: S("filter_queue") },
      { id: "aside", t: S("filter_aside") },
      { id: "new", t: S("filter_new") }
    ];
  }

  function filterName() {
    var found = filters().filter(function (f) { return f.id === filterId; })[0];
    return found ? found.t : (model.markById[filterId] ? model.markById[filterId].label : filterId);
  }

  // Search covers the whole card and the reader's own words. The author's notes are excluded
  // on purpose: he never sees them, so finding a card by one would be a card found by nothing.
  function matches(card) {
    // The slider comes first and is not one of the filters: a card it cut away is out of the
    // deck for now, so the search must not hand it back and the whole-deck view must not list it.
    if (!shows(card)) return false;
    var q = query.trim().toLowerCase();
    if (q) {
      var rec = store.get(card.id) || {};
      var hay = [card.q, card.tag, card.answer || "", card.material.d, card.material.code,
        rec.my || "", rec.draft || ""]
        .concat((rec.msgs || []).map(function (m) { return m.t; }))
        .concat(card.from.map(function (m) { return m.t; }))
        .join(" ").toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    if (!filterId) return true;
    if (filterId === "untouched") return inQueue(card);
    if (filterId === "new") return store.isNew(card);
    if (filterId === "aside") return store.setAside(card.id);
    return (store.get(card.id) || {}).mark === filterId;
  }

  // ---- what a returning round brought with it (S4) -------------------------------------

  // Counted, never declared: the author bumps `round` and rewrites his own half, and these
  // three numbers fall out of the records he already has.
  // Two numbers, and deliberately not a third. «New» cannot be counted honestly: a card he
  // never opened looks exactly like a card that did not exist last round, and inventing the
  // difference would put a number on screen that nothing on disk supports.
  function roundSummary() {
    var out = { rewritten: 0, commented: 0, discuss: 0, any: false };
    model.cards.forEach(function (card) {
      if (store.asked(card.id, card.q)) out.rewritten++;
      if (card.from.some(function (m) { return m.round >= model.round; })) out.commented++;
      if (hasWords(card.id)) out.discuss++;
    });
    out.any = !!(out.rewritten || out.commented);
    return out;
  }

  // ---- rail ----------------------------------------------------------------------------

  function rail() {
    var col = el("div", "fx col rail");

    var next = st(el("button", "btn sec fx ac jb none"), "padding: 0 14px;");
    add(next,
      el("div", null, isFirst() ? S("rail_start") : S("rail_next")),
      add(st(el("div", "fx ac"), "gap: 6px;"),
        st(el("div", "num qcount", String(queueCount())), "font-size: 13.5px; font-weight: 600;"),
        st(el("div", "mut", S("rail_in_queue")), "font-size: 12px;")));
    next.addEventListener("click", function () {
      var k = nextUntouched();
      if (k >= 0) go(k);
    });
    add(col, next);

    var search = st(el("div", "tf fx ac jb none"), "height: 34px; margin-top: 12px; padding: 0 8px 0 12px;");
    var input = el("input", "dim");
    input.type = "text";
    input.placeholder = S("rail_search_ph");
    input.value = query;
    st(input, "flex: 1 1 auto; min-width: 0; border: 0; background: transparent; outline: none;" +
      " font: inherit; font-size: 12.5px; color: var(--tx);");
    input.addEventListener("input", function () {
      query = input.value;
      wantSearchFocus = true;
      render();
    });
    input.addEventListener("keydown", function (e) {
      if (e.key === "Escape") { query = ""; input.blur(); render(); }
    });
    add(search, input, el("div", "pill num", "/"));
    add(col, search);

    var filter = st(el("div", "fx ac jb none"), "height: 18px; margin-top: 10px;");
    add(filter, el("div", "lbl", filterId ? S("rail_filter_on", filterName()) : S("rail_filter_off")),
      action(filterOpen ? S("rail_filter_hide") : (filterId ? S("rail_filter_change") : S("rail_filter_set")),
        function () { filterOpen = !filterOpen; render(); }, filterOpen));
    add(col, filter);

    if (filterOpen) {
      var opts = st(el("div", "fx wrp none"), "margin-top: 8px; gap: 6px;");
      filters().concat(model.marks.map(function (m) { return { id: m.id, t: m.label }; }))
        .forEach(function (o) {
          var b = el("button", "mk c" + (filterId === o.id ? " sel" : ""), o.t);
          b.addEventListener("click", function () {
            filterId = filterId === o.id ? null : o.id;
            render();
          });
          add(opts, b);
        });
      add(col, opts);
    }

    add(col, st(el("div", "rule none"), "margin-top: 16px;"));

    var narrowed = query.trim() || filterId;
    var found = model.cards.filter(matches);
    var caption = st(el("div", "fx ac jb none"), "height: 14px; margin-top: 16px;");
    add(caption, el("div", "lbl", narrowed ? S("rail_found") : S("rail_topics")),
      narrowed ? el("div", "lbl", String(found.length)) : null);
    add(col, caption);

    var list = st(el("div", "fx col nosb msk grow"), "margin-top: 12px; gap: 4px; overflow-y: auto;");
    if (narrowed) {
      if (!found.length) add(list, st(el("div", "lg", S("rail_nothing_found")), "padding: 8px 12px;"));
      found.forEach(function (card) {
        var index = model.cards.indexOf(card);
        var row = el("button", "rrow" + (index === cur ? " sel" : ""));
        add(row, st(el("div", "ell", card.q), "min-width: 0;"),
          st(el("div", "num", pad(index + 1)), "font-size: 12px; flex: none; margin-left: 8px;"));
        row.addEventListener("click", function () { view = "work"; go(index); });
        add(list, row);
      });
      add(col, list, st(el("div", "grow"), ""), el("div", "rule none"));
      var back = st(el("div", "fx ac jb none"), "height: 36px;");
      add(back, el("div", "lbl", S("rail_whole_deck_n", model.cards.length)),
        action(S("rail_clear_filter"), function () { query = ""; filterId = null; filterOpen = false; render(); }));
      return add(col, back);
    }
    // A closed stack is a flat row on the page. An open one is one surface carrying its name,
    // its cells and its description together: three things on one ground cannot be mistaken
    // for three rows of a list, which is what the old inset description was mistaken for.
    model.blocks.forEach(function (block) {
      // A stack whose every card the slider cut away goes with them: a name over no cells is a
      // row he can open onto nothing.
      var live = blockShown(block);
      if (!live.length) return;
      var open = block.n === openBlock;
      var row = el("button", "rrow" + (open ? " top" : ""));
      add(row, el("div", null, block.t || S("rail_block_n", block.n)));
      // The count survives as the one thing a count is good for: an answer to a question he
      // actually asked, on hover, instead of a column of numbers he never asked anything of.
      // Out of the cards the slider left standing, because those are the cells under it.
      row.title = S("rail_block_title", blockQueue(block),
        S.n(blockQueue(block), "cards_n"), live.length);
      row.addEventListener("click", function () {
        // From the send form or the whole-deck view a stack means «take me back into the
        // deck, right here»; it opens, it does not fold shut on a click he never meant as a
        // second press.
        if (view !== "work") { view = "work"; copied = ""; openBlock = block.n; }
        else openBlock = open ? null : block.n;
        render();
      });
      if (!open) { add(list, row); return; }

      var stack = el("div", "stk none");
      add(stack, row);
      var wrap = el("div", "fx wrp qwrap");
      live.forEach(function (card) {
        var index = model.cards.indexOf(card);
        var s = cardState(card, index);
        var chip = el("button", s.cls, pad(index + 1));
        if (s.discuss) add(chip, el("div", "tdot"));
        chip.addEventListener("click", function () { go(index); });
        add(wrap, chip);
      });
      add(stack, wrap);
      if (block.note) add(stack, el("div", "desc", block.note));
      add(list, stack);
    });
    add(col, list);

    add(col, st(el("div", "grow"), ""), railFoot(), reviewRow(), el("div", "rule none"));
    var foot = st(el("div", "fx ac jb none"), "height: 36px;");
    add(foot, el("div", "lbl", S("rail_whole_deck_n", model.cards.length)),
      action(view === "deck" ? S("act_close") : S("rail_deck_open"), function () {
        view = view === "deck" ? "work" : "deck";
        render();
      }, view === "deck"));
    return add(col, foot, railTools());
  }

  // Everything that is about the page and not about the card standing on it. It used to be a row
  // of its own under the card, and that row cost the card column a height it never got back: the
  // card stopped 42px and two margins short of the bottom of the window for three controls he
  // presses a few times an hour.
  //
  // The rail is where they belong and the card's own corner is not. × and ↻ up there are the two
  // things this card can have done to it; «settings» and «keys» are not about this card at
  // all, and the rail already carries every other page-level control there is - «Next», the
  // search, the filter, «the whole deck». One place for one kind of thing.
  function railTools() {
    var box = st(el("div", "fx col none rel"), "margin-top: 14px; gap: 10px;");

    var open = st(el("button", "btn sec wide fx ac"), "gap: 10px;");
    add(open, st(el("div", "acf"), "width: 7px; height: 7px; border-radius: 2px; flex: none;"),
      st(el("div", null, S("tools_show_form")), "min-width: 0;"));
    open.addEventListener("click", function () { view = "send"; copied = ""; render(); });
    add(box, open);
    if (isFirst()) add(box, el("div", "lg", S("tools_form_hint")));
    if (undoable) add(box, action(S("tools_undo", undoable.what), undo));

    var row = st(el("div", "fx ac jb none"), "height: 36px;");
    var ask = el("button", "ic" + (keysOpen ? " on" : ""), "?");
    ask.title = S("tools_keys");
    ask.setAttribute("aria-label", S("tools_keys"));
    ask.addEventListener("click", function () { keysOpen = !keysOpen; render(); });
    add(row, action(S("tools_settings"), function () { drawer = true; render(); }), ask);
    add(box, row);
    if (keysOpen) add(box, keysPanel());
    return box;
  }

  // Above the rail's own footer, and only on a deck opened just now: what the empty cells will
  // become. The two legend lines that stood here afterwards («came in round N», «you wrote
  // something here») are gone. They explained a ring and a dot that are on screen anyway, and
  // a legend for a mark he has already seen twenty times is a label naming what is in front of
  // him. The marks themselves stay on the cells.
  // The one control that undoes «reread» in bulk. A fixed word, on or off, for the same
  // reason the two toggles under the card have one: a button that renames itself is two buttons
  // wearing one. It is not on screen when there is nothing hidden and the mode is off, because
  // then it is a label for a state he can already see, which is what he took off every surface
  // here. The count beside it is the only place the number of hidden cards is said out loud.
  function reviewRow() {
    if (!MARK_AGAIN) return null;
    var out = 0;
    // Only what the slider left on screen: a number counting struck-through cells he cannot see
    // is a number about another deck.
    model.cards.forEach(function (c) { if (shows(c) && store.reread(c.id, markSide(c.id))) out++; });
    var on = store.review();
    if (!out && !on) return null;

    var row = st(el("div", "fx ac jb none"), "margin-bottom: 14px; gap: 10px;");
    var b = el("button", "tog c" + (on ? " on" : ""), S("review_all"));
    b.title = S("review_hint", MARK_AGAIN.label);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.addEventListener("click", function () { store.review(!on); render(); });
    add(row, b, el("div", "lbl", out + " " + S.n(out, "hidden_n")));
    return row;
  }

  function railFoot() {
    if (!isFirst()) return null;
    var box = st(el("div", "veil fx col none"), "margin-bottom: 16px; padding: 12px 14px 13px; gap: 6px;");
    return add(box, el("div", "lbl", S("foot_empty")),
      el("div", "lg", S("foot_empty_note")));
  }

  // ---- inside the card --------------------------------------------------------------------

  function gateClosed(card) {
    return card.form === "recall" && !store.rec(card.id).told;
  }

  // Every round he has already answered, newest first. The current round joins them once a
  // comment has arrived: that is the whole of M1 - he does not want to re-read himself.
  function foldedRounds(card) {
    var out = store.history(card.id)
      .filter(function (h) { return h.rec.my || h.rec.val !== null; })
      .map(function (h) { return { round: h.round, rec: h.rec }; });
    var mine = store.rec(card.id);
    var commented = card.from.some(function (m) { return m.round >= model.round; });
    if (commented && mine.told) out.unshift({ round: model.round, rec: mine });
    return out;
  }

  function said(card, rec) {
    if (rec.my) return rec.my;
    if (rec.val === null) return "";
    if (card.reply.mode === "scale") {
      var s = model.scales[card.reply.scale];
      return s && s.labels[rec.val] ? s.labels[rec.val] : String(rec.val);
    }
    if (card.reply.mode === "choice") {
      var v = Array.isArray(rec.val) ? rec.val : [rec.val];
      return v.map(function (i) { return card.reply.options[i]; }).filter(Boolean).join(", ");
    }
    return String(rec.val);
  }

  var openFold = false;

  // One fold, and it holds both halves of every earlier round: what he wrote and what came
  // back. It replaces two separate blocks that sat in different places and that he could not
  // find at all. Collapsed by default, because he opened the card for what is new on it.
  function pastRounds(card) {
    var mine = store.history(card.id)
      .filter(function (h) { return said(card, h.rec) || (h.rec.msgs || []).length; })
      .map(function (h) { return { round: h.round, rec: h.rec }; });
    var theirs = card.from.slice();
    var seen = {};
    mine.forEach(function (m) { seen[m.round] = true; });
    theirs.forEach(function (t) { seen[t.round] = true; });
    return {
      mine: mine,
      theirs: theirs,
      rounds: Object.keys(seen).map(Number).sort(function (a, b) { return b - a; })
    };
  }

  function pastTitle(past) {
    var names = past.rounds.map(function (r) { return S("round_n", r); }).join(", ");
    var what = past.mine.length && past.theirs.length ? S("past_both")
      : (past.mine.length ? S("past_mine") : S("past_theirs"));
    return S("past_title", names, what);
  }

  // Nothing at all when it is shut. The strip that used to stand here closed - «round 3, round 2
  // · your answer» with «open» on the end - took a 40px band under the field on every card that
  // had any history, and it is a band he was not reading: what opens it lives up beside the card
  // number now, see historyAction(). Open, it is an inline fold and pushes the body down rather
  // than floating over it, because the body is the one thing on this card that scrolls and a
  // panel hanging over a two-line field would cover the field he just asked to have pinned.
  function pastBlock(card) {
    var past = pastRounds(card);
    if (!past.rounds.length || !openFold) return null;

    var title = pastTitle(past);
    var box = st(el("div", "note none"), "margin-top: 8px; padding: 16px 18px;");
    var head = st(el("div", "fx ac jb"), "margin-bottom: 10px;");
    add(head, el("div", "lbl", title),
      action(S("fold_collapse"), function () { openFold = false; render(); }, true));
    add(box, head);

    past.rounds.forEach(function (r, i) {
      var wrap = st(el("div", "fx col"), (i ? "margin-top: 14px;" : "") + " gap: 7px;");
      add(wrap, el("div", "lbl", S("round_n", r)));
      past.mine.filter(function (m) { return m.round === r; }).forEach(function (m) {
        var text = said(card, m.rec);
        if (text) add(wrap, st(el("div", "bd14", text), "white-space: pre-wrap;"));
        (m.rec.msgs || []).forEach(function (msg) {
          add(wrap, st(el("div", "bd"), "white-space: pre-wrap;")).lastChild.textContent = msg.t;
        });
      });
      past.theirs.filter(function (t) { return t.round === r; }).forEach(function (t) {
        var note = st(el("div", "note acc"), "padding: 11px 14px 12px;");
        add(note, st(el("div", "lbl", S("past_author")), "margin-bottom: 6px;"), richText(t.t));
        add(wrap, note);
      });
      add(box, wrap);
    });
    return box;
  }

  // The one control that opens the fold, and it stands beside the card's number rather than in
  // the row with «set aside» and «hard». Those two are decisions he makes about this card and
  // they look like decisions: filled pills that stay pressed. This is navigation - it changes
  // nothing on the card, it only says whether what is already written on it is on screen - so it
  // is a line of quiet text with a chevron, the same shape as «settings» in the rail. Two levels
  // of task must not wear one button.
  function historyAction(card) {
    var past = pastRounds(card);
    if (!past.rounds.length) return null;
    // One word, and it stays that word open or shut: the chevron is what turns over.
    var row = action(S("card_history"), function () { openFold = !openFold; render(); }, openFold);
    row.title = pastTitle(past);
    return st(row, "flex: none;");
  }

  // The author's text becomes nodes, never a string of HTML: `el` sets textContent, so a stray
  // < or & in a deck is a character and can never be anything else. The markup itself is parsed
  // in model.js, where it can be tested without a browser.
  // `opts.seen` is asked about every block, by the hash of the text that block was written
  // from, and a block it says yes to is one he has already been shown: it steps to the right
  // and dims, the way a line of code that is inside something steps to the right. Nothing else
  // about it changes, because it is the same block and he may want to read it again.
  function richText(text, cls, opts) {
    var box = el("div", cls || "bd14");
    DeckModel.markup(text).forEach(function (b, i) {
      var node;
      if (b.kind === "dia") node = monoBlock(b);
      else if (b.kind === "flow") node = flowBlock(b);
      else if (b.kind === "tree") node = treeBlock(b);
      else {
        node = el("div");
        if (i) node.style.marginTop = "14px";
        b.lines.forEach(function (runs, j) {
          if (j) add(node, el("br"));
          runs.forEach(function (r) { add(node, inlineRun(r, opts)); });
        });
      }
      if (node && opts && opts.seen && opts.seen(DeckModel.stamp(b.src))) node.classList.add("seen");
      add(box, node);
    });
    return box;
  }

  // A tag alone inside bold is the one bold phrase that is not a phrase: it is a marker, and a
  // marker is perceived as a colour far faster than it is read as a word. The `em` class stays
  // on it, so everything that counts bold phrases keeps counting it, the brackets stay in the text,
  // because the brackets are what the author typed and what a search for it will look for.
  function inlineRun(r, opts) {
    if (!r.b) {
      // The other pointer in the prose. It keeps whatever the run already was, the way a card
      // pointer does: an address written inside an aside is still an aside, so the anchor sits
      // in the `it` host rather than wearing the class itself, or `.it`'s muted grey would
      // beat the colour every link on the page has.
      if (r.u) return r.i ? add(el("span", "it"), linkTo(r)) : linkTo(r);
      if (!opts || !opts.jump) return el("span", r.i ? "it" : null, r.t);
      // The pointer keeps whatever the run already was: «_all of it in card 29_» is how the
      // author writes one, and an aside that stops being an aside to become a link would be
      // the sentence changing weight under him for saying where something else is.
      var host = el("span", r.i ? "it" : null);
      DeckModel.refSplit(r.t).forEach(function (piece) {
        add(host, (piece.n && cardRef(piece, opts.jump)) || document.createTextNode(piece.t));
      });
      return host;
    }
    var key = DeckModel.tagKey(r.t);
    return el("span", key ? "em tg tg-" + key : "em", r.t);
  }

  // A link the author wrote as a link. It opens in a new tab, and that is not a habit: a deck
  // page holds an answer he is in the middle of typing, and a click that navigated this tab
  // away would take the unsent draft with it. `rel="noopener"` because a `_blank` target hands
  // the page it opens a handle back on this one, and nothing outside needs one.
  // The text is the address as the model read it; `el` sets textContent, so it stays characters.
  function linkTo(r) {
    var a = el("a", "lnk", r.t);
    a.href = r.u;
    a.target = "_blank";
    a.rel = "noopener";
    return a;
  }

  // A pointer at card 33 behaves like the cell numbered 33 in the rail: one press and he is on
  // that card. It marks nothing on either of them - following a pointer in the middle of an
  // answer is not leaving the card, and the set of blocks he has read must not be written by a
  // gesture that means «show me that for a second». A number no card carries is left as the
  // text it is: a broken link is worse than a sentence.
  function cardRef(piece, jumpTo) {
    var index = piece.n - 1;
    if (index < 0 || index >= model.cards.length) return null;
    var b = el("button", "cref", piece.t);
    b.title = model.cards[index].q;
    b.addEventListener("click", function () { jumpTo(index); });
    return b;
  }

  function monoBlock(b) {
    var dia = el("div", "mono");
    var cols = el("div", "nosb msk", b.lines.join("\n"));
    cols.setAttribute("data-axis", "x");
    return add(dia, cols);
  }

  // A box carries its tag as a colour and not as a word: the word is already the thing in the
  // box. The tag is on `title` so that what the colour means is still recoverable by hovering.
  // A ghost is the box a branch comes out of, drawn a second time so the branch can start from
  // it; it says so in the same place, because a dashed outline is a convention and a sentence
  // is not.
  function nodeBox(n, cls) {
    var box = el("div", cls + " tg-" + (n.key || "no") + (n.ghost ? " ghost" : ""), n.t);
    var says = n.ghost ? S("dia_ghost") : "";
    if (n.tag) says = says ? n.tag + " · " + says : n.tag;
    if (says) box.title = says;
    return box;
  }

  // A thin line with a chevron, drawn in CSS. The label written as `{30 s}` rides above it.
  function edgeArrow(label) {
    var a = el("div", "farr");
    if (label) add(a, el("div", "flab", label));
    var bar = el("div", "fbar");
    add(bar, el("i", "fline"), el("i", "ftip"));
    return add(a, bar);
  }

  // Each arrow is glued to the node it points at, so a row that does not fit wraps between the
  // pairs and never leaves an arrow pointing at the end of a line.
  function flowBlock(b) {
    if (!b.rows.length) return null;
    var box = el("div", "flow");
    b.rows.forEach(function (row) {
      var r = el("div", "frow" + (row.branch ? " br" : ""));
      row.nodes.forEach(function (n, i) {
        var unit = el("div", "funit");
        if (i) add(unit, edgeArrow(n.edge));
        add(unit, nodeBox(n, "fnode"));
        add(r, unit);
      });
      add(box, r);
    });
    return box;
  }

  function treeRow(n) {
    var row = el("div", "tnode");
    if (n.q) return add(row, el("div", "tq", n.t.replace(/\?+$/, "").trim()), el("div", "tqc", "?"));
    if (n.leaf) {
      if (n.cond) add(row, el("div", "tcond", n.cond));
      return add(row, edgeArrow(""), nodeBox(n.leaf, "tbox"));
    }
    return add(row, el("div", "tline", n.t));
  }

  // Real nesting rather than a computed indent: the guide line down the side of a level is the
  // border of the box that level's lines sit in, so it starts and stops where the branch does.
  // A container is made only when a deeper line actually arrives - an empty one would draw a
  // guide line down the side of nothing.
  function treeBlock(b) {
    if (!b.nodes.length) return null;
    var box = el("div", "tree");
    var hosts = [box];
    b.nodes.forEach(function (n) {
      var lvl = Math.max(0, Math.min(n.level, hosts.length));
      while (hosts.length > lvl + 1) hosts.pop();
      if (lvl === hosts.length) {
        var kids = el("div", "tkids");
        add(hosts[hosts.length - 1], kids);
        hosts.push(kids);
      }
      add(hosts[lvl], treeRow(n));
    });
    return box;
  }

  // The card's body is two blocks, and the lower one is the answer to the question on the card.
  // Above it stand the notes: what he asked about the answer and what a term in it means.
  // They are his own follow-ups answered, not the answer, so they are a box of their own in a
  // tint of their own - mixed into one column of prose they made the answer unfindable, which
  // is what this splits.
  //
  // It is the one box on the card that carries a name, and it carries one because it is the
  // exception: the answer needs no label because the card is the answer, while a block of side
  // answers standing over it does need to say that is what it is.
  //
  // Behind a closed gate it is not drawn at all. Notes are written about an answer he has
  // not been shown yet, and half of them give it away.
  function clarBlock(card) {
    if (!card.clar || gateClosed(card)) return null;
    var box = st(el("div", "note none clar"), "margin-top: 18px; padding: 15px 18px 16px;");
    add(box, st(el("div", "lbl", S("card_clar_title")), "margin-bottom: 10px;"));
    return add(box, richText(card.clar, null, {
      seen: function (hash) { return store.wasRead(card.id, hash); },
      jump: jump
    }));
  }

  // No «answer» label: the box is the answer, and a label that names what he is looking at is
  // the thing he asked to have taken off every surface on this page.
  // `under` is «the notes stand above»: the two blocks of the card sit 16 px apart, while the
  // first block of the card, whichever of the two it turns out to be, keeps the 18 px that has
  // always stood between the card's head and its body.
  function answerBlock(card, under) {
    if (!card.answer) return null;
    var top = under ? "16px" : "18px";
    if (gateClosed(card)) {
      var veil = st(el("div", "veil none fx ac jc"), "margin-top: " + top + "; height: 56px; gap: 10px;");
      add(veil, el("div", "lbl", S("card_gate_veil")));
      return veil;
    }
    var box = st(el("div", "note none"), "margin-top: " + top + "; padding: 16px 18px;");
    return add(box, richText(card.answer, null, {
      seen: function (hash) { return store.wasRead(card.id, hash); },
      jump: jump
    }));
  }

  // ---- what he has already read -------------------------------------------------------------
  //
  // He rereads whole cards because nothing on one says which part of it he has seen before. The
  // rule he asked for is the one code uses: what is already dealt with steps to the right and
  // goes quiet, and what is new stands where the eye looks first. The unit is a block of the
  // answer - a paragraph, a diagram, a drawn flow or tree.
  //
  // THE RULE, in his words. A card counts as read only when he says so, by pressing the › and
  // going on to the next one; that one press is the whole of it, and it is also the press that
  // writes his answer. Opening a card, walking the deck, following a pointer, ×, «reread»,
  // the rail, the search and closing the page all record nothing at all.
  //
  // Two guards stay on top of that. `visited` - the card the page merely opened on is not a card
  // he arrived at. The gate - behind a shut gate there is no answer on screen, so nothing is
  // recorded and, just as important, nothing is cleared: the last real set stands.
  var visited = false;

  function keepRead(card) {
    if (view !== "work" || !visited) return;
    if (!card || (!card.answer && !card.clar) || gateClosed(card)) return;
    // One set per card, covering both blocks in the order they were drawn: what he read is what
    // was on the card, and which of the two boxes it stood in is not something the set records.
    // The route is named out loud because store.js holds the closed list of routes that record,
    // and core/selftest.js pins that this is the only call of it in the file.
    store.leaveRead(card.id, DeckModel.cardHashes(card), "arrow");
  }

  // No line over the box. It carried «round N», which the page already says in its top right
  // corner, and «not recorded», which was a second way of saying the primary button has not been
  // pressed yet; between them they took a row off the card and told him nothing he could not
  // already see.

  // One line at rest, two before the box stops growing and scrolls inside itself. It used to
  // start at three lines and stretch to twelve, and to take every spare pixel of the card on
  // top of that, so an empty field pushed the answer he came for off the screen. Two is what
  // it holds now, because the box no longer scrolls away with the card body: every pixel it
  // takes is a pixel the answer above it does not get, at every moment and not only while he
  // is typing. Past two lines it scrolls inside itself, with no bar: a bar on a two-line box
  // is more chrome than box.
  //
  // The padding is the textarea's own, 8px above and below, and that is the whole of what was
  // wrong here: the frame used to carry 16px of padding and the box that scrolls sat inside
  // it, so the text was clipped 17px short of the border and the gap read as a white strip
  // laid over the line he was reading. Padding inside the scroller scrolls with the content,
  // so the last line now runs to the border itself and 8px of air is what stands over it at
  // rest. A line is 16px at 1.68, which is 26.88, so two lines and the two paddings are 70.
  var ANSWER_LINE = 27;
  var ANSWER_PAD = 16;
  var ANSWER_MIN = ANSWER_LINE + ANSWER_PAD;
  var ANSWER_MAX = ANSWER_LINE * 2 + ANSWER_PAD;

  // Nothing stretches the box any more, so the height is simply what his text needs, clamped.
  function fitAnswer(area) {
    area.style.height = "auto";
    area.style.height = Math.min(Math.max(area.scrollHeight, ANSWER_MIN), ANSWER_MAX) + "px";
  }

  function textField(card) {
    var rec = store.rec(card.id);
    // The box is exactly as tall as what is in it, between one line and two. It claims no
    // spare height of its own: the spare height belongs to the answer above it. The frame
    // itself pads nothing - every pixel of inset belongs to the box that scrolls, or the
    // text is cut off short of the border with white left under it.
    var box = st(el("div", "field fx col none"), "margin-top: 18px;");
    var area = el("textarea", "ftx nosb");
    // A textarea's intrinsic height is `rows` lines, and `rows` defaults to two, so an empty
    // box measured at height:auto reports two lines whatever the clamp says. One line at rest
    // is one row.
    area.rows = 1;
    st(area, "flex: none; min-height: " + ANSWER_MIN + "px; overflow-y: auto;" +
      " border: 0; padding: 8px 20px; background: transparent; outline: none; resize: none;" +
      " font: inherit; font-size: 16px; line-height: 1.68; color: var(--ftx);");
    area.value = rec.draft || rec.my || "";
    // Four words. Two sentences of instruction sat here and were read as content already in
    // the box; what the box is for is said once, on the first open, in the line under it.
    area.placeholder = S("card_answer_ph");
    area.addEventListener("input", function () {
      store.setDraft(card.id, area.value);
      // Repainted by hand rather than re-rendered: rebuilding the page under his cursor is
      // exactly what typing must never do.
      fitAnswer(area);
      masks(document);
      paintCounts();
    });
    add(box, area);
    if (isFirst()) {
      // Its own inset, because the frame has none to lend it any more.
      var foot = st(el("div", "fx ac jb none"), "margin: 2px 20px 12px;");
      var nextCard = cur + 1 < model.cards.length ? S("first_next_q", pad(cur + 2)) : S("first_last_q");
      add(foot, el("div", "lbl", S("first_nowhere")), el("div", "lbl", nextCard));
      add(box, foot);
    }
    return box;
  }

  function pickField(card) {
    var rec = store.rec(card.id);
    var many = card.reply.mode === "choice" && card.reply.many;
    var labels = card.reply.mode === "scale"
      ? model.scales[card.reply.scale].labels
      : card.reply.options;
    var chosen = rec.val === null ? [] : (Array.isArray(rec.val) ? rec.val : [rec.val]);

    var box = st(el("div", "field grow fx col"), "margin-top: 18px; min-height: 96px; padding: 16px 20px;");
    var track = st(el("div", "fx wrp"), "gap: 8px;");
    labels.forEach(function (label, i) {
      var b = el("button", "mk" + (chosen.indexOf(i) >= 0 ? " sel" : ""), label);
      b.addEventListener("click", function () {
        remember(card.id, S("undo_answer"));
        if (!many) { store.setValue(card.id, chosen[0] === i ? null : i); }
        else {
          var next = chosen.slice();
          var at = next.indexOf(i);
          if (at >= 0) next.splice(at, 1); else next.push(i);
          store.setValue(card.id, next.length ? next.sort() : null);
        }
        render();
      });
      add(track, b);
    });
    add(box, track);
    if (card.reply.mode === "scale" && model.scales[card.reply.scale].note) {
      add(box, st(el("div", "lg", model.scales[card.reply.scale].note), "margin-top: 10px;"));
    }
    return box;
  }

  // The assistant's word about the round as a whole, with what the round actually brought
  // counted beside it. Same note on the first open and on a returning round: the difference is
  // only in what there is to count.
  function roundNote() {
    var said = model.from.filter(function (m) { return m.round === model.round; })[0];
    var sum = roundSummary();
    if (!said && !sum.any) return null;

    var box = st(el("div", "note none"), "margin-top: 18px; padding: 13px 18px;");
    var head = st(el("div", "fx ac jb"), "margin-bottom: 7px;");
    add(head, el("div", "lbl", S("round_note_head", model.round)));
    if (sum.any) {
      var pills = st(el("div", "fx ac wrp"), "gap: 8px;");
      if (sum.rewritten) add(pills, el("div", "pill", S("round_rewritten", sum.rewritten)));
      if (sum.commented) add(pills, el("div", "pill", S("round_commented", sum.commented)));
      add(head, pills);
    }
    add(box, head);
    if (said) add(box, st(el("div", "bd14", said.t), "white-space: pre-wrap;"));
    return box;
  }

  // What scrolls: the answer and, under it, the fold with everything that came before. The
  // fold is history, and history does not get to stand between him and the question.
  //
  // The one box he writes in is NOT here any more: it is the card column's own last row, out
  // of this scroller, so that reading the answer can never carry it off the screen. A deck
  // that answers on a scale or with a choice keeps its field in here, where it always was:
  // those are a row of buttons he presses once, not a box he types in and re-reads.
  function cardBody(box, card, block) {
    add(box, roundNote());
    if (card.material.d) {
      add(box, st(el("div", "bd14 none", card.material.d), "margin-top: 18px; white-space: pre-wrap;"));
    }
    var clar = clarBlock(card);
    add(box, clar);
    add(box, answerBlock(card, !!clar));
    if (card.reply.mode !== "text" && card.reply.mode !== "none") add(box, pickField(card));
    add(box, pastBlock(card));
    if (card.reply.mode !== "none" && card.reply.mode !== "text") {
      add(box, st(el("div", "grow"), ""));
    }
  }

  // Typing must not rebuild the page under the cursor, so the two things a keystroke can change
  // repaint by hand instead. The number in the rail, and the strike on this card's own cell:
  // writing something under «reread» puts the card back in the queue on the spot, and a cell
  // that goes on saying it is out of the queue is a cell that is lying while he watches it.
  function paintCounts() {
    var n = document.querySelector(".qcount");
    if (n) n.textContent = String(queueCount());
    var chip = document.querySelector(".qwrap .qn.cur");
    var card = model.cards[cur];
    if (chip && card) chip.classList.toggle("hid", isHidden(card));
  }

  // ---- settings, his answers, the keyboard ----------------------------------------------------

  var drawer = false;
  var drawerSaid = "";

  // One line per action, and every action on the card has one. The two groups are not a
  // style: a combination works while he is typing, a single letter cannot, because the box he
  // types in would eat it. Esc is what gets him out of the box, so the letters are reachable
  // without the mouse, and the panel says so in the same words.
  // The glyph as written, and the key of the line beside it.
  var KEYS_MOD = [
    ["\u2318 \u21b5", "key_record_next"],
    ["\u2318 \u21e7 \u21b5", "key_close_forever"],
    ["\u2318 Z", "key_undo"],
    ["Esc", "key_escape"]
  ];
  var KEYS_BARE = [
    ["X", "key_close_forever"],
    ["R", "key_reread"],
    ["S", "key_skip"],
    ["J / K", "key_walk"],
    ["/", "key_search"]
  ];

  var keysOpen = false;

  function keyRows(list) {
    var col = st(el("div", "fx col none"), "gap: 7px;");
    list.forEach(function (k) {
      var line = st(el("div", "fx ac"), "gap: 12px;");
      add(line, st(el("div", "pill num", k[0]), "flex: none; min-width: 54px; justify-content: center;"),
        st(el("div", "bd"), "min-width: 0;"));
      line.lastChild.textContent = S(k[1]);
      add(col, line);
    });
    return col;
  }

  function keysPanel() {
    var box = el("div", "keys fx col");
    var head = st(el("div", "fx ac jb none"), "margin-bottom: 11px;");
    add(head, el("div", "lbl", S("tools_keys")),
      action(S("act_close"), function () { keysOpen = false; render(); }, true));
    add(box, head, keyRows(KEYS_MOD));
    add(box, st(el("div", "rule none"), "margin: 12px 0;"));
    add(box, st(el("div", "lbl none", S("keys_bare_head")), "margin-bottom: 9px;"));
    add(box, keyRows(KEYS_BARE));
    add(box, st(el("div", "lg none", S("keys_esc_note")), "margin-top: 11px;"));
    return box;
  }

  function download(name, text) {
    var url = URL.createObjectURL(new Blob([text], { type: "application/json" }));
    var a = document.createElement("a");
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function drawerPanel() {
    var veil = st(el("div"), "position: absolute; inset: 0; background: rgba(0,0,0,.28);");
    veil.addEventListener("click", function () { drawer = false; drawerSaid = ""; render(); });

    var box = st(el("div", "card fx col"),
      "position: absolute; top: 0; right: 0; height: 100%; width: 520px; border-radius: 22px 0 0 22px;" +
      " padding: 32px 40px; overflow-y: auto;");
    box.className += " nosb";

    var head = st(el("div", "fx ac jb none"), "height: 26px;");
    add(head, el("div", "lbl", S("tools_settings")), action(S("act_close"), function () {
      drawer = false; drawerSaid = ""; render();
    }, true));
    add(box, head);

    add(box, st(el("div", "lbl none", S("set_theme")), "margin-top: 26px;"));
    var themes = st(el("div", "track none"), "margin-top: 10px; align-self: flex-start;");
    [["auto", S("theme_auto")], ["light", S("theme_light")], ["dark", S("theme_dark")]].forEach(function (t) {
      var now = store.pref("theme") || "auto";
      var b = el("button", "mk" + (now === t[0] ? " sel" : ""), t[1]);
      b.addEventListener("click", function () { store.pref("theme", t[0]); applyTheme(); render(); });
      add(themes, b);
    });
    add(box, themes);

    add(box, st(el("div", "lbl none", S("set_answers")), "margin-top: 28px;"));
    add(box, st(el("div", "lg none", S("set_answers_note")), "margin-top: 8px;"));
    var row = st(el("div", "fx wrp none"), "margin-top: 12px; gap: 10px;");

    var save = el("button", "btn sec", S("set_export"));
    save.addEventListener("click", function () {
      download(S("file_answers", model.key), store.exportAll());
      drawerSaid = S("set_saved");
      render();
    });

    var load = el("button", "btn sec", S("set_import"));
    var picker = el("input");
    picker.type = "file";
    picker.accept = "application/json,.json";
    st(picker, "display: none;");
    picker.addEventListener("change", function () {
      var file = picker.files && picker.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var res = store.importAll(String(reader.result), "merge");
        drawerSaid = res.ok
          ? S("set_merged", res.added, res.updated)
          : S("set_failed", res.why);
        render();
      };
      reader.readAsText(file);
    });
    load.addEventListener("click", function () { picker.click(); });

    // The old tool wiped without offering a copy first. Here the copy is not offered, it is
    // taken: the file downloads and only then is anything cleared.
    var wipe = el("button", "btn off", S("set_wipe"));
    wipe.addEventListener("click", function () {
      if (!window.confirm(S("set_wipe_confirm"))) return;
      download(S("file_before_wipe", model.key), store.exportAll());
      store.importAll(JSON.stringify({ data: { v: store.schema, cards: {}, extra: {}, prefs: {} } }), "replace");
      drawerSaid = S("set_wiped");
      render();
    });

    add(row, save, load, wipe, picker);
    add(box, row);

    // Not behind a confirmation and not beside «Erase everything»: it throws away a note about
    // what he has looked at, not a word he wrote. The worst it can do is offer him a card he
    // has already read, which is the state every card starts in anyway.
    add(box, st(el("div", "lbl none", S("set_read")), "margin-top: 28px;"));
    add(box, st(el("div", "lg none", S("set_read_note")), "margin-top: 8px;"));
    var forget = st(el("button", "btn sec"), "margin-top: 12px; align-self: flex-start;");
    forget.textContent = S("set_forget");
    forget.addEventListener("click", function () {
      store.forgetRead();
      drawerSaid = S("set_forgot");
      render();
    });
    add(box, forget);

    if (drawerSaid) add(box, st(el("div", "act none", drawerSaid), "margin-top: 12px;"));

    add(box, st(el("div", "grow"), ""));
    add(box, st(el("div", "rule none"), "margin-top: 20px;"));
    add(box, st(el("div", "lg none",
      S("set_footer", model.key, model.round, Object.keys(store.raw().cards).length,
        S.n(Object.keys(store.raw().cards).length, "records_n"), store.schema)),
      "margin-top: 12px;"));

    var wrap = st(el("div"), "position: absolute; inset: 0;");
    return add(wrap, veil, box);
  }

  // ---- the whole deck at once ---------------------------------------------------------------

  function deckFrame() {
    var box = st(el("div", "card grow"), "padding: 24px 40px;");
    var shown = model.cards.filter(matches);

    var head = st(el("div", "fx ac jb none"), "height: 26px;");
    add(head, el("div", "lbl", S("deck_all")),
      el("div", "lbl", S("deck_shown", shown.length, model.cards.length)));
    add(box, head);
    add(box, st(el("div", "sf q none", model.title || S("deck_fallback_title")),
      "font-size: 26px; line-height: 1.34; margin-top: 16px;"));

    var list = st(el("div", "fx col grow nosb msk"), "margin-top: 16px; gap: 4px; overflow-y: auto;");
    var lastBlock = null;
    shown.forEach(function (card) {
      var index = model.cards.indexOf(card);
      if (card.block !== lastBlock) {
        lastBlock = card.block;
        var b = model.blocks.filter(function (x) { return x.n === card.block; })[0];
        add(list, st(el("div", "lbl none", b && b.t ? b.t : S("deck_block_n", card.block)),
          "margin: 16px 0 4px 12px;"));
      }
      var rec = store.get(card.id) || {};
      var row = st(el("button", "rrow" + (index === cur ? " sel" : "")), "height: auto; padding: 8px 11px;");
      var left = st(el("div", "fx ac"), "gap: 12px; min-width: 0;");
      var s = cardState(card, index);
      var chip = el("div", s.cls.replace(" cur", ""), pad(index + 1));
      if (s.discuss) add(chip, el("div", "tdot"));
      add(left, st(chip, "flex: none;"), st(el("div", "ell", card.q), "min-width: 0;"));
      var right = st(el("div", "fx ac"), "gap: 6px; flex: none; margin-left: 10px;");
      if (store.isNew(card)) add(right, el("div", "new", S("badge_new")));
      if (rec.mark && model.markById[rec.mark]) add(right, el("div", "pill", model.markById[rec.mark].label));
      row.addEventListener("click", function () { view = "work"; go(index); });
      add(row, left, right);
      add(list, row);
    });
    if (!shown.length) add(list, st(el("div", "lg", S("deck_no_match")), "padding: 8px 12px;"));
    add(box, list);
    return box;
  }

  // ---- the send form ------------------------------------------------------------------------

  var view = "work";
  var scope = null;
  var copied = "";

  function copy(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(done, function () { fallback(text); done(); });
      return;
    }
    fallback(text);
    done();
  }
  function fallback(text) {
    var area = document.createElement("textarea");
    area.value = text;
    document.body.appendChild(area);
    area.select();
    try { document.execCommand("copy"); } catch (e) { /* the preview is still on screen */ }
    document.body.removeChild(area);
  }

  function sendFrame() {
    var form = DeckSend.build(model, store, scope);
    var box = st(el("div", "card grow"), "padding: 24px 40px;");

    var head = st(el("div", "fx ac jb none"), "height: 26px;");
    add(head, el("div", "lbl", S("send_preview")),
      el("div", "lbl", copied ? copied : S("send_nothing_yet")));
    add(box, head);

    add(box, st(el("div", "sf q none", S("send_lead")),
      "font-size: 26px; line-height: 1.34; margin-top: 16px;"));

    // Seven stacks are wider than the card at 900 and near enough at 1400, and the strip used
    // to take that width and push it through the page. It is its own scroller now: it never
    // widens the card, it carries no bar, and the fade at its end is what says there is more.
    // It is added straight to the card so that the column's stretch gives it the card's width;
    // wrapped in a flex row it would have claimed the width of its children again.
    var track = st(el("div", "track x nosb msk none"), "margin-top: 16px;");
    track.setAttribute("data-axis", "x");
    var options = [{ n: null, t: S("deck_all") }].concat(model.blocks.map(function (b) {
      return { n: b.n, t: b.t || S("deck_block_n", b.n) };
    }));
    options.forEach(function (o) {
      var b = el("button", "mk" + (scope === o.n ? " sel" : ""), o.t);
      b.addEventListener("click", function () { scope = o.n; render(); });
      add(track, b);
    });
    add(box, track);

    var pre = st(el("div", "tfq grow fx col"), "margin-top: 16px; padding: 15px 20px;");
    var scroll = el("div", "sc grow nosb msk");
    var body = st(el("div", "bd14", form.text), "white-space: pre-wrap; font-variant-numeric: tabular-nums;");
    add(pre, add(scroll, body));
    add(box, pre);

    // «Anything else» belongs here and nowhere else: it is written for this form, so it is
    // written while the form is on screen, and the preview above it grows as he types.
    var free = st(el("div", "tfq fx col none"), "margin-top: 12px; padding: 12px 16px;");
    add(free, st(el("div", "lbl", S("send_extra_head", model.round)), "margin-bottom: 6px;"));
    var note = el("textarea", "bd14");
    st(note, "height: 46px; border: 0; background: transparent; outline: none; resize: none;" +
      " font: inherit; font-size: 14px; line-height: 1.6; color: var(--bd-tx);");
    note.value = store.extra();
    // Three words, for the same reason as the one on the card: at 46px tall the old sentence
    // wrapped, was cut in the middle and read as text already written in the box.
    note.placeholder = S("send_extra_ph");
    note.addEventListener("input", function () {
      store.extra(note.value);
      body.textContent = DeckSend.build(model, store, scope).text;
    });
    add(free, note);
    add(box, free);

    add(box, st(el("div", "rule none"), "margin-top: 16px;"));

    var row = st(el("div", "fx ac jb none"), "height: 42px; margin-top: 16px;");
    add(row, el("div", "lbl", S("send_counts",
      form.counts.answered, S.n(form.counts.answered, "answers_n"),
      form.counts.fresh,
      form.counts.asked, S.n(form.counts.asked, "questions_n"),
      form.counts.untouched)));

    var right = st(el("div", "fx ac"), "gap: 12px;");
    var back = el("button", "btn off", S("send_close"));
    back.addEventListener("click", function () { view = "work"; copied = ""; render(); });
    var take = el("button", "btn pri");
    add(take, el("div", null, S("send_copy")));
    take.addEventListener("click", function () {
      // Rebuilt at the click: «anything else» is edited on this very screen without a re-render.
      var now = DeckSend.build(model, store, scope);
      copy(now.text, function () {
        store.markSent(now.ids);
        copied = S("send_copied", now.text.length);
        render();
      });
    });
    add(right, back, take);
    add(row, right);
    return add(box, row);
  }

  // ---- the card frame -------------------------------------------------------------------

  function cardFrame() {
    var card = model.cards[cur];
    var box = st(el("div", "card grow"), "padding: 24px 40px;");
    if (!card) {
      return add(box, st(el("div", "q sf", S("card_none")), "font-size: 22px;"));
    }

    // The number and the stack stay: he cannot see those anywhere else. The tag under the title
    // and the form label on the right both named what was already in front of him, so both go,
    // and what is left of the row is one line of facts and two buttons.
    // 36px tall, because the two buttons in it are 36px and the line centres on them.
    var head = st(el("div", "fx ac jb none"), "height: 36px;");
    var block = model.blocks.filter(function (b) { return b.n === card.block; })[0];
    var was = store.asked(card.id, card.q);
    var hl = st(el("div", "fx ac"), "gap: 12px; min-width: 0;");
    add(hl, st(el("div", "lbl ell"), "min-width: 0;"));
    hl.lastChild.textContent = S("card_q_n", pad(cur + 1)) +
      (block && block.t ? " \u00b7 " + block.t : "");
    if (was) add(hl, badge(S("badge_rewritten"), S("badge_rewritten_note", model.round)));
    else if (isFirst()) add(hl, badge(S("badge_first"), S("badge_first_note")));
    else if (store.isNew(card)) add(hl, badge(S("badge_new"), S("badge_new_note")));
    add(hl, backAction(), historyAction(card));

    // Closing the card lives on the card, in its corner, because that is where a thing you are
    // finished with is closed. «Reread» stands beside it: the same gesture, the other answer.
    var hr = el("div", "corner");
    if (MARK_AGAIN) {
      var again = el("button", "ic" + (markOf(card.id) === MARK_AGAIN.id ? " on" : ""), "↻");
      again.title = S("card_again_title", MARK_AGAIN.label);
      again.setAttribute("aria-label", MARK_AGAIN.label);
      again.addEventListener("click", rereadCard);
      add(hr, again);
    }
    if (MARK_DONE) {
      var done = el("button", "ic x" + (markOf(card.id) === MARK_DONE.id ? " on" : ""), "×");
      done.title = S("card_done_title", MARK_DONE.label);
      done.setAttribute("aria-label", MARK_DONE.label);
      done.addEventListener("click", closeCard);
      add(hr, done);
    }
    add(head, hl, hr);
    add(box, head);

    add(box, st(el("div", "sf q none", card.q),
      "font-size: 26px; line-height: 1.34; font-weight: 400; margin-top: 16px; max-width: 900px;"));

    // The wording he actually answered last time, taken from his own record rather than from
    // the deck file, which only ever carries the newest text.
    if (was) {
      var older = st(el("div", "fx ac none"), "height: 20px; margin-top: 10px; gap: 12px;");
      add(older, st(el("div", "lbl", S("card_was_round", was.round)), "flex: none;"),
        st(el("div", "sf q mu ell"), "font-size: 14px; min-width: 0;"));
      older.lastChild.textContent = "«" + was.q + "»";
      add(box, older);
    }

    // The field absorbs slack while the card is short, and the whole body scrolls once a
    // fold, a thread and an answer no longer fit together. Scrolling costs a clip at the padding
    // box, and that clip cut the edges off the field standing inside it: on the left and the
    // right the ring was cut, and at the bottom, where the field is the last thing in the
    // scroller and ends exactly on the clip, the 1px border itself was. The box is pulled 6px
    // out on every side and padded back, so the border and the ring are whole and nothing
    // moves. 6px covers the widest of them, the 3.5px --field-ring.
    // 10px of margin on top of the 6px of padding is 16px of air between the question and the
    // first line of the body; without it the faded top edge of the scroller runs into the
    // question's descenders and reads as a smudge under it rather than as a fade.
    var body = st(el("div", "fx col grow bscroll nosb msk"),
      "overflow-y: auto; margin: 10px -6px -6px; padding: 6px;");
    cardBody(body, card, block);
    add(box, body);

    // Everything from the box he types in down is one group, and the group is the bottom of the
    // card column: the body above it scrolls, this does not. He was scrolling down to write and
    // back up to read, which is the one thing the layout must not ask of him.
    //
    // In the wide layout that is free - the column is a flex column of the window's height and
    // this is its last, unshrinkable row. In the narrow one the page itself scrolls, so the
    // group is sticky against the bottom of the window instead; it is the whole footer that
    // sticks and not the field alone, because a sticky box is stopped by its container's floor
    // and not by its siblings, and a field alone would ride down over the toggles at the very
    // end of the scroll. It paints the card's own background: the body's text passes under it.
    var foot = st(el("div", "fx col none cfoot"), "");
    if (card.reply.mode === "text") add(foot, textField(card));

    add(foot, st(el("div", "rule none"), "margin-top: 16px;"));

    // One baseline for the whole row: the two toggles on the left are 26px pills, the two
    // buttons on the right are 42px, and the row centres both against its own 42px.
    var row = st(el("div", "fx ac jb none"), "height: 42px; margin-top: 16px;");
    var left = st(el("div", "fx ac"), "gap: 8px;");
    add(left, toggle(card, "prio"), toggle(card, "diff"));

    var closed = gateClosed(card);
    var right = st(el("div", "fx ac"), "gap: 12px;");
    var skip = el("button", "btn off", closed ? S("card_dont_know") : S("card_skip"));
    skip.title = S("card_skip_title");
    skip.addEventListener("click", skipCard);

    // No words on it. It is the only primary button on the screen, it points forward, and what
    // it costs in keys is written in the panel at the bottom instead of on the button.
    var go = st(el("button", "btn pri fx ac jc"), "width: 52px; padding: 0;");
    add(go, el("div", null, "\u203A"));
    go.title = S("card_go_title", closed ? S("card_go_open") : S("card_go_record"));
    go.setAttribute("aria-label", closed ? S("card_go_open_aria") : S("card_go_record_aria"));
    go.addEventListener("click", record);
    add(right, skip, go);

    add(row, left, right);
    add(foot, row);
    return add(box, foot);
  }

  // Two toggles, one fixed word each, on or off and nothing else. The label never renames
  // itself: a control that says «priority» and then says «later» is two controls wearing one
  // button, and he cannot tell from it which of the two he is looking at.
  //
  // The store keeps what it always kept. «set aside» is prio === false, which is the half of
  // store.setAside() that the «set aside» filter reads; pressing it again clears the flag
  // back to unset rather than writing prio === true, so «not decided» and «decided to put it
  // off» stay the different things the store says they are. prio === true is simply never
  // written from the screen any more: there is no «priority» button to write it. An older bucket
  // that holds one still reads, and reads as «not set aside», which is what it always meant.
  // `label` and `hint` are keys, not text; the word itself is in core/strings.*.js.
  var TOGGLES = {
    prio: { label: "tog_aside", on: false, hint: "tog_aside_hint" },
    diff: { label: "tog_hard", on: true, hint: "tog_hard_hint" }
  };

  function toggle(card, name) {
    var t = TOGGLES[name];
    var on = store.flag(card.id, name) === t.on;
    var b = el("button", "tog" + (on ? " on" : ""), S(t.label));
    b.title = S(t.hint);
    b.setAttribute("aria-pressed", on ? "true" : "false");
    b.addEventListener("click", function () {
      store.flag(card.id, name, on ? null : t.on);
      render();
    });
    return b;
  }

  // On the header line and only during the visit a pointer started, because that is the only
  // time there is anywhere obvious to go back to. It names the number, not «back»: the number
  // is what he read in the sentence he clicked and what is on the cell he came from.
  function backAction() {
    if (!backTo) return null;
    var b = el("button", "bck", S("card_back_to", pad(backTo.n)));
    b.title = model.cards[backTo.index].q;
    b.addEventListener("click", function () { go(backTo.index); });
    return b;
  }

  function badge(word, note) {
    var box = st(el("div", "fx ac"), "gap: 10px;");
    return add(box, el("div", "new", word), el("div", "lbl", note));
  }

  // ---- render -------------------------------------------------------------------------------

  function render() {
    applyTheme();
    var page = el("div", "gs page");
    add(page, header());
    var band = model.errors.length ? errorBand() : null;
    if (band) add(page, band);
    var main = el("div", "fx r-main" + (band ? " tight" : ""));
    add(main, rail(), !model.cards.length ? brokenFrame()
      : view === "send" ? sendFrame() : view === "deck" ? deckFrame() : cardFrame());
    add(page, main);
    if (drawer) add(page, drawerPanel());
    var keptBody = document.querySelector(".bscroll");
    var keptRail = document.querySelector(".rail .nosb");
    var bodyTop = keptBody ? keptBody.scrollTop : 0;
    var railTop = keptRail ? keptRail.scrollTop : 0;
    document.body.innerHTML = "";
    document.body.appendChild(page);
    var freshBody = page.querySelector(".bscroll");
    var freshRail = page.querySelector(".rail .nosb");
    if (freshBody && bodyTop) freshBody.scrollTop = bodyTop;
    if (freshRail && railTop) freshRail.scrollTop = railTop;
    document.title = model.title || S("deck_fallback_title");
    // A stored answer is put into the box while the page is still detached, where scrollHeight
    // is 0 and nothing can be measured. This is the first moment it can be: it is the path a
    // long answer of a past round comes back through, not only the keyboard.
    var answer = page.querySelector(".field textarea");
    if (answer) fitAnswer(answer);
    // Last, because every scroller's mask is a fact about its own scrollHeight, and the line
    // above has just changed one of them.
    masks(page);
    // The mark on a cell the slider just brought back is consumed by the render that drew it:
    // the fade is two seconds of CSS that ends by itself, and a redraw half a minute later for
    // some other reason must not flash cells that arrived long ago.
    wIn = null;
    if (wantSearchFocus) {
      wantSearchFocus = false;
      wantFocus = false;
      var box = page.querySelector(".tf input");
      if (box) { box.focus(); box.setSelectionRange(box.value.length, box.value.length); }
      return;
    }
    // He is still on the control: the arrow keys have to go on moving it, and the cursor must not
    // land in the answer box of a card he has not chosen to deal with yet. The cell he is on is
    // the one that takes the focus, which is where a segmented control puts it.
    if (wantWFocus) {
      wantWFocus = false;
      wantFocus = false;
      var here = page.querySelector(".wsg.on");
      if (here) here.focus();
      return;
    }
    if (wantFocus) {
      wantFocus = false;
      var area = page.querySelector(".field textarea");
      if (area) { area.focus(); area.setSelectionRange(area.value.length, area.value.length); }
    }
  }

  var wantFocus = true;

  // Both layouts, because the same physical key sends a different character under Cyrillic and
  // the shortcut has to be the key he pressed, not the letter that came out of it.
  function isKey(e, latin, cyrillic) {
    var k = e.key;
    return k === latin || k === latin.toUpperCase() ||
      k === cyrillic || k === cyrillic.toUpperCase();
  }

  function typingNow() {
    var node = document.activeElement;
    return !!node && /^(TEXTAREA|INPUT)$/.test(node.tagName);
  }

  document.addEventListener("keydown", function (e) {
    // A key pressed before the table arrived has nothing to act on yet.
    if (!model) return;
    var mod = e.metaKey || e.ctrlKey;

    // The two that have to work with the cursor still in the box.
    if (mod && e.key === "Enter") {
      e.preventDefault();
      if (e.shiftKey) closeCard(); else record();
      return;
    }
    if (mod && isKey(e, "z", "\u044f")) {
      if (!undoable) return;
      e.preventDefault();
      undo();
      return;
    }

    // Escape is the way out of the box, which is what makes the single letters reachable.
    if (e.key === "Escape") {
      if (typingNow()) { document.activeElement.blur(); return; }
      if (keysOpen) { keysOpen = false; render(); return; }
      if (drawer) { drawer = false; drawerSaid = ""; render(); return; }
      if (view !== "work") { view = "work"; render(); return; }
      return;
    }

    if (typingNow() || mod || e.altKey) return;
    if (e.key === "/") { e.preventDefault(); wantSearchFocus = true; render(); return; }
    if (isKey(e, "x", "\u0447")) { e.preventDefault(); closeCard(); return; }
    if (isKey(e, "r", "\u043a")) { e.preventDefault(); rereadCard(); return; }
    if (isKey(e, "s", "\u044b")) { e.preventDefault(); skipCard(); return; }
    if (isKey(e, "j", "\u043e")) { go(step(1), true); return; }
    if (isKey(e, "k", "\u043b")) { go(step(-1), true); return; }
  });

  // ---- a deck the reader brought himself ------------------------------------------------
  //
  // Two ways a deck can reach the page, tried in this order. `window.DECK` is the private
  // repo's own path and the only one the decks on disk take: when it is there, nothing else
  // in this section runs at all.
  var HASH_AT = /[#&]d=([^&]+)/;
  var DECK_AT = "ownwords:decks:";
  var INDEX_AT = "ownwords:index";

  function packer() { return typeof LZString !== "undefined" ? LZString : null; }

  function resolveDeck() {
    if (window.DECK) return window.DECK;
    var m = HASH_AT.exec(window.location.hash || "");
    var lz = packer();
    if (!m || !lz) return null;
    try {
      var json = lz.decompressFromEncodedURIComponent(m[1]);
      return json ? JSON.parse(json) : null;
    } catch (e) { return null; }
  }

  // JSON, or the `window.DECK = {...};` file an author actually writes. The prefix is stripped
  // and the rest read as data first; only when that fails is the text run as code, because a
  // deck file may legitimately be JS and a pasted deck is text he chose to open.
  function parseDeck(text) {
    var body = String(text == null ? "" : text).replace(/^\ufeff/, "").trim();
    var bare = body.replace(/^(?:window\s*\.\s*)?DECK\s*=\s*/, "").replace(/;\s*$/, "");
    try { return { ok: true, deck: JSON.parse(bare) }; } catch (e) { /* not JSON; try it as JS */ }
    try {
      var box = {};
      new Function("window", body + "\n;return window.DECK;")(box);
      if (box.DECK) return { ok: true, deck: box.DECK };
      return { ok: false, why: S("own_not_a_deck") };
    } catch (e) {
      return { ok: false, why: S("own_bad_text", e && e.message ? e.message : String(e)) };
    }
  }

  // His own key when the deck carries one - it is the name of his bucket and must never move -
  // and otherwise a short hash of the text, so the same deck pasted twice lands in one bucket.
  function deckKey(deck, json) {
    if (deck && typeof deck.key === "string" && deck.key.trim()) return deck.key.trim();
    return "deck-" + DeckModel.stamp(json);
  }

  function indexRead() {
    try { return JSON.parse(window.localStorage.getItem(INDEX_AT)) || []; }
    catch (e) { return []; }
  }

  function indexWrite(key, title) {
    var list = indexRead().filter(function (e) { return e && e.key !== key; });
    list.unshift({ key: key, title: title, at: Date.now() });
    window.localStorage.setItem(INDEX_AT, JSON.stringify(list));
  }

  // The hash when lz-string is on the page, so the whole deck travels inside the link; without
  // it the page is simply redrawn, which is the same deck and the same records either way.
  function show(deck, json) {
    window.DECK = deck;
    var lz = packer();
    if (lz) {
      try { window.location.hash = "d=" + lz.compressToEncodedURIComponent(json); }
      catch (e) { /* the deck is already in hand; only the shareable link is lost */ }
    }
    boot();
  }

  function loadFromText(text) {
    useStrings();
    var read = parseDeck(text);
    if (!read.ok) return read;
    var deck = read.deck;
    if (!deck || typeof deck !== "object" || (!deck.key && !deck.blocks)) {
      return { ok: false, why: S("own_not_a_deck") };
    }
    var key = deckKey(deck, JSON.stringify(deck));
    deck.key = key;
    var json = JSON.stringify(deck);
    try {
      window.localStorage.setItem(DECK_AT + key, json);
      indexWrite(key, deck.title || deck.copyPrefix || key);
    } catch (e) {
      return { ok: false, why: S("own_no_storage") };
    }
    show(deck, json);
    return { ok: true, key: key };
  }

  function openStored(key) {
    useStrings();
    var json = null;
    try { json = window.localStorage.getItem(DECK_AT + key); } catch (e) { json = null; }
    if (!json) return { ok: false, why: S("own_not_a_deck") };
    try { show(JSON.parse(json), json); }
    catch (e) { return { ok: false, why: S("own_bad_text", e && e.message ? e.message : String(e)) }; }
    return { ok: true, key: key };
  }

  // The whole of what the public landing page may call.
  window.OwnWords = { loadFromText: loadFromText, open: openStored, list: indexRead };

  // ---- boot ---------------------------------------------------------------------------------

  // The table when it is there, the bare keys when it is not: a page of keys can be read and
  // fixed, a page that throws on its first string cannot.
  function useStrings() {
    if (window.DeckStrings) { S = window.DeckStrings; return; }
    if (S) return;
    S = function (key) { return String(key); };
    S.n = function (count, key) { return String(key); };
  }

  // What the page is built from, once there is a table to build it out of.
  function boot() {
    useStrings();
    model = DeckModel.build(resolveDeck() || {});
    store = DeckStore.create({
      key: model.key,
      round: model.round,
      onError: function (kind) { failed = kind; if (store) render(); }
    });
    // A second deck on the same page is a second control: the cached node belongs to the model
    // it was built against.
    wBox = null;
    wPos = wRead();
    // The page opens on the first card the control leaves standing, not on the first card in the
    // file: a stop he set last time must not land him on a card the rail is no longer showing.
    var first = model.cards.filter(shows)[0] || model.cards[0] || null;
    cur = first ? model.cards.indexOf(first) : 0;
    openBlock = first ? first.block : null;
    MARK_DONE = sideMark("done");
    MARK_AGAIN = sideMark("mine");
    render();
  }

  // A deck page lists data, model, store, send and shell and nothing else, and the pages on disk
  // were written before the table existed. So the table is fetched from beside this file rather
  // than named over there: every deck keeps its own text without its own html being touched.
  //
  // English always, and beside it the table for whatever language the page says it is written in
  // - `DECK.lang` if the deck declares one, else the `lang` on `<html>`, which is the order the
  // accessor itself reads them in. A page that names no other language, or one whose table is not
  // on disk, loses nothing: the accessor falls back to English key by key.
  function withStrings(done) {
    if (window.DeckStrings) { done(); return; }
    var here = (document.currentScript && document.currentScript.src) || "";
    if (!here) { done(); return; }
    var want = ["strings.js", "strings.en.js"];
    var tag = (window.DECK && window.DECK.lang) ||
      (document.documentElement && document.documentElement.lang) || "";
    tag = String(tag).split("-")[0].toLowerCase();
    if (/^[a-z]{2,3}$/.test(tag) && tag !== "en") want.push("strings." + tag + ".js");
    var left = want.length;
    want.forEach(function (name) {
      var tag = document.createElement("script");
      tag.src = here.replace(/[^/]+\.js/, name);
      // On a failed load too: a page of bare keys can be read and fixed, a blank one cannot.
      tag.onload = tag.onerror = function () { if (!--left) done(); };
      document.head.appendChild(tag);
    });
  }

  withStrings(boot);
})();
