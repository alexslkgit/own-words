// Deck model: turns the author's window.DECK into a validated, frozen structure.
// Field roles, not card kinds - the four forms are derived here and nowhere else.
(function (root, factory) {
  // The accessor, not the text: every message below is a key looked up in core/strings.*.js.
  var get = typeof module === "object" && module.exports
    ? function () { return require("./strings.js"); }
    : function () { return root.DeckStrings; };
  var api = factory(get);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DeckModel = api;
})(typeof self !== "undefined" ? self : this, function (get) {
  // Resolved on every call and never captured: a deck page written before the table existed
  // fetches it after this file has already run, so there is nothing to hold on to at load.
  function S() { return get().apply(null, arguments); }
  S.n = function (count, key) { return get().n(count, key); };


  var REPLY_MODES = ["text", "scale", "choice", "none"];
  var SIDES = ["mine", "done"];

  function stamp(s) {
    var h = 0x811c9dc5;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = (h * 0x01000193) >>> 0; }
    return h.toString(16);
  }

  function isText(v) { return typeof v === "string" && v.trim() !== ""; }
  function arr(v) { return Array.isArray(v) ? v : (v == null ? [] : [v]); }

  // ---- the answer's markup ------------------------------------------------------------
  //
  // The smallest markup that survives being wrong. It returns a tree, never a string of HTML,
  // so the shell builds text nodes out of it and there is no innerHTML anywhere on the path an
  // author's text takes to the screen. An unmatched marker is left as the literal character it
  // is, because a half-typed ** must look like a typo and not eat the rest of the card.
  //
  // Seven rules, and nothing else is markup:
  //   blank line            paragraph break
  //   **bold**              the phrase that matters
  //   _italic_              the aside that matters least
  //   http:// or https://   a link, the one rule that reads the thing itself and not a marker
  //   a line that is exactly «Diagram:»  opens a monospace block, closed by the next blank line
  //   a line that is exactly «Flow:»     opens a drawn flow, closed by the next blank line
  //   a line that is exactly «Tree:»     opens a drawn decision tree, same close
  //
  // «Diagram:» is kept for the decks that already carry one: it is text drawn by hand and the
  // engine keeps it character for character. «Flow:» and «Tree:» are the opposite - the
  // author writes the relations and the engine draws the boxes, which is the whole point of
  // them: a diagram has to be perceived, not read.
  //
  // Every answer written before this existed still renders the same, because those answers are
  // plain lines separated by blank lines with a diagram heading, which is exactly what this
  // reads. The `_` rule is deliberately narrow: an opener must sit on a word boundary AND be
  // followed by a letter or a digit, which is what keeps Swift out of it. `os_signpost` has a
  // letter before the underscore, `func set(_ k:` has a space after it and `report(_:)` has a
  // colon, so none of the three can open a span.
  //
  // The three headings are a table and not three literals, so a strings table may add its own
  // spelling of each under `blockTokens` and a deck written in those goes on parsing. The block
  // keeps the heading the author typed, so its source - and the hash taken of that source - is
  // the same whichever spelling opened it.
  var BLOCK_TOKENS = { "Diagram:": "dia", "Flow:": "flow", "Tree:": "tree" };
  var ARROW = " -> ";

  // The four tags an author may hang on a node or on a bold marker. The name is what he writes,
  // the key is what the shell turns into a colour. Anything else reads as untagged, and untagged
  // is neutral rather than an error: one mistyped tag must not stop a diagram from drawing.
  var TAGS = { "iOS": "ios", "\u0441\u0435\u0440\u0432\u0435\u0440": "srv", "\u0441\u0435\u0442\u044c": "net", "\u0431\u0430\u0437\u0430": "db" };

  function tagKey(raw) {
    if (typeof raw !== "string") return "";
    var s = raw.trim();
    if (s.charAt(0) === "[" && s.charAt(s.length - 1) === "]") s = s.slice(1, -1).trim();
    return Object.prototype.hasOwnProperty.call(TAGS, s) ? TAGS[s] : "";
  }

  // `[iOS] phone` -> { tag: "iOS", key: "ios", t: "phone" }. A node that is nothing but its
  // tag keeps the tag's own word as its label, because a tag on its own is what an author
  // writes when the box is the database and has no better name.
  function diaNode(text) {
    var s = String(text).trim();
    var tag = "", key = "";
    if (s.charAt(0) === "[") {
      var close = s.indexOf("]");
      if (close > 0) {
        tag = s.slice(1, close).trim();
        key = tagKey(tag);
        var rest = s.slice(close + 1).trim();
        s = rest || tag;
      }
    }
    return { tag: tag, key: key, t: s };
  }

  // One row of a flow: nodes separated by ` -> `, an optional `{label}` on the arrow in front of
  // a node, two leading spaces meaning «this row hangs off the row above». The label belongs to
  // the node it points at, so a row is one list and the arrows never have to be counted apart.
  //
  // A branch is written by repeating the node it comes out of, and that repeat is marked here,
  // `ghost: true`, so the screen can draw it as the same box rather than as another one. Without
  // the mark a branch reads as a new chain starting at a new node, which is exactly how a row
  // beginning with a node already drawn above was read as an arrow out of the phones. The
  // repeated node is looked for anywhere in the row above and not only at its end: a flow
  // branches off the middle of a row at least as often as off its last box.
  function flowRow(line, above) {
    var branch = line.indexOf("  ") === 0;
    var parts = line.replace(/^\s+/, "").split(ARROW);
    var nodes = parts.map(function (part, i) {
      var s = part.trim();
      var edge = "";
      if (i > 0 && s.charAt(0) === "{") {
        var close = s.indexOf("}");
        if (close > 0) { edge = s.slice(1, close).trim(); s = s.slice(close + 1).trim(); }
      }
      var n = diaNode(s);
      n.edge = edge;
      n.ghost = false;
      return n;
    });
    if (branch && above && nodes.length > 1 && repeats(above.nodes, nodes[0])) nodes[0].ghost = true;
    return { branch: branch, nodes: nodes };
  }

  // The same box, said again: same word and same tag. A node whose text alone matches but whose
  // tag does not is a different box that happens to share a name, and drawing it as a repeat
  // would be a lie about where the branch comes from.
  function repeats(nodes, node) {
    return nodes.some(function (n) { return n.t === node.t && n.key === node.key; });
  }

  // One line of a decision tree. Two spaces per level; a line ending in `?` is the question, a
  // line of the shape `<condition> -> X` is a branch whose X is a box.
  function treeLine(line) {
    var lead = line.length - line.replace(/^ +/, "").length;
    var level = Math.floor(lead / 2);
    var s = line.trim();
    var at = s.indexOf(ARROW);
    if (at > 0) {
      return { level: level, q: false, cond: s.slice(0, at).trim(),
        leaf: diaNode(s.slice(at + ARROW.length)), t: "" };
    }
    return { level: level, q: s.charAt(s.length - 1) === "?", cond: "", leaf: null, t: s };
  }

  function isWordChar(ch) {
    return !!ch && /[0-9A-Za-z\u0400-\u04ff]/.test(ch);
  }

  // A run of text with the two flags that can be on it. Adjacent runs of the same shape are
  // merged so a caller never sees ["a"]["b"] where the author wrote "ab". A link is the one run
  // that never absorbs its neighbour: it carries an address, and the words beside it do not.
  function pushRun(runs, text, bold, italic) {
    if (!text) return;
    var last = runs[runs.length - 1];
    if (last && !last.u && last.b === bold && last.i === italic) { last.t += text; return; }
    runs.push({ t: text, b: bold, i: italic });
  }

  // Where a span is allowed to start: the head of the line, after a space, or just inside a
  // bracket or an opening quote. Nothing else, which is the whole reason `user_id` survives -
  // an underscore glued to the end of a word is never an opener.
  var OPEN_BEFORE = "«(\"";          // « ( "
  // What may stand right after a span ends: the end of the line, a space, or the punctuation a
  // sentence puts after a closing aside.
  var CLOSE_AFTER = ".,;:!?)»";      // . , ; : ! ? ) »

  function isOpenBefore(ch) {
    return ch === "" || /\s/.test(ch) || OPEN_BEFORE.indexOf(ch) >= 0;
  }

  function closerAt(line, i, mark) {
    // A closing marker ends a real span: anything solid in front of it - a letter, a digit, `%`,
    // `»`, a full stop - and nothing behind it that would carry the sentence on. The one solid
    // character that does not close is the bracket a span may open after, or `report(_:)` would
    // pair with the `setOverlay(_:)` before it and swallow the code between them.
    if (line.substr(i, mark.length) !== mark) return false;
    if (isOpenBefore(line.charAt(i - 1))) return false;
    var after = line.charAt(i + mark.length);
    return after === "" || /\s/.test(after) || CLOSE_AFTER.indexOf(after) >= 0;
  }

  function openerAt(line, i, mark) {
    if (line.substr(i, mark.length) !== mark) return false;
    if (!isOpenBefore(line.charAt(i - 1))) return false;
    var after = line.charAt(i + mark.length);
    return after !== "" && !/\s/.test(after);
  }

  // ---- a link, which is the one run written without a marker around it ------------------
  //
  // Nobody wraps a URL in anything: he writes the address and expects to press it. So the rule
  // reads the address itself, and it is deliberately the narrowest rule that can work -
  // `http://` or `https://` and then anything that is not a space. A bare `www.`, a host with a
  // port and no scheme, an e-mail: all of them stay prose. A rule that misses a link costs him
  // one copy-paste; a rule that swallows prose silently rewrites an answer he already typed,
  // and there are decks full of those.
  var URL_SCAN = /https?:\/\/\S+/g;

  // What a sentence puts after a link and what is therefore not inside it: the same punctuation
  // that may stand after a closing aside, plus the brackets and quotes a link gets wrapped in.
  // Those characters stay in the paragraph as themselves; only the href loses them.
  var URL_TRAIL = ".,;:!?)»]}\"'";   // . , ; : ! ? ) » ] } " '

  function urlEnd(s) {
    var end = s.length;
    while (end > 0 && URL_TRAIL.indexOf(s.charAt(end - 1)) >= 0) end--;
    return end;
  }

  // `https://` with nothing behind it is a word, not an address, and the question is asked after
  // the punctuation has come off, so «see https://.» never becomes a link to nowhere.
  function hasHost(url) {
    var at = url.indexOf("://");
    return at > 0 && url.length > at + 3;
  }

  // Ordinary text, cut on the links inside it. A link becomes a run of its own carrying `u`, the
  // address exactly as written: nothing is normalised, nothing is encoded, no scheme is added.
  // Bold text is handed straight on and never cut, for the same reason a card pointer is left
  // alone inside bold - a bold run is already a marker and may be a tag, `**[iOS]**`. An aside
  // is cut, and the link inside it stays an aside, which is how a pointer behaves too.
  function pushText(runs, text, bold, italic) {
    if (!text) return;
    if (bold) { pushRun(runs, text, bold, italic); return; }
    var re = new RegExp(URL_SCAN.source, "g");
    var at = 0, m;
    while ((m = re.exec(text)) !== null) {
      var url = m[0].slice(0, urlEnd(m[0]));
      // Whatever was trimmed off the end is text again, so the scan resumes at the trim.
      re.lastIndex = m.index + url.length;
      if (!hasHost(url)) continue;
      pushRun(runs, text.slice(at, m.index), bold, italic);
      runs.push({ t: url, b: bold, i: italic, u: url });
      at = m.index + url.length;
    }
    pushRun(runs, text.slice(at), bold, italic);
  }

  function inline(line) {
    var runs = [];
    var buf = "";
    var i = 0;
    while (i < line.length) {
      var two = line.substr(i, 2);
      if (two === "**") {
        var endB = line.indexOf("**", i + 2);
        if (endB > i + 2) {
          pushText(runs, buf, false, false); buf = "";
          pushRun(runs, line.slice(i + 2, endB), true, false);
          i = endB + 2;
          continue;
        }
      }
      if (line.charAt(i) === "_" && openerAt(line, i, "_")) {
        var j = i + 1, endI = -1;
        while (j < line.length) {
          if (closerAt(line, j, "_")) { endI = j; break; }
          j++;
        }
        if (endI > i + 1) {
          pushText(runs, buf, false, false); buf = "";
          pushText(runs, line.slice(i + 1, endI), false, true);
          i = endI + 1;
          continue;
        }
      }
      buf += line.charAt(i);
      i++;
    }
    pushText(runs, buf, false, false);
    return runs;
  }

  // Every block also carries the text it was written from, trimmed. That is what a per-block
  // hash is taken of, and it has to come from here rather than from a second split on blank
  // lines: a diagram heading opens a block with no blank line in front of it, so a naive split
  // would hand back one block where the screen draws two, and the hashes would then be about
  // text nobody ever saw as a unit.
  function blockSrc(lines) { return lines.join("\n").trim(); }

  // The three built-in headings, plus whatever the loaded strings tables add under
  // `blockTokens`. Every loaded table is read and not only the active one, so a deck parses the
  // same whether or not the page reading it is set to the language the deck was written in. No
  // table, no entry, no accessor at all - the built-in three still stand.
  function blockTokens() {
    var out = {};
    Object.keys(BLOCK_TOKENS).forEach(function (t) { out[t] = BLOCK_TOKENS[t]; });
    var api = get();
    if (!api || typeof api.table !== "function" || typeof api.langs !== "function") return out;
    api.langs().forEach(function (code) {
      var extra = api.table(code).blockTokens;
      if (extra) Object.keys(extra).forEach(function (t) { out[t] = extra[t]; });
    });
    return out;
  }

  // Blocks, in the order the author wrote them. A paragraph keeps its own line breaks: the
  // decks already written put one sentence on one line and expect exactly that on screen.
  function markup(text) {
    var out = [];
    if (typeof text !== "string" || text === "") return out;
    var lines = text.split("\n");
    var tokens = blockTokens();
    var para = null, dia = null, flow = null, tree = null;

    function flush() {
      if (para && para.lines.length) out.push({ kind: "p", lines: para.lines, src: blockSrc(para.raw) });
      if (dia) out.push({ kind: "dia", head: dia.head, lines: dia.lines, src: blockSrc([dia.head].concat(dia.lines)) });
      if (flow) out.push({ kind: "flow", head: flow.head, rows: flow.rows, src: blockSrc([flow.head].concat(flow.raw)) });
      if (tree) out.push({ kind: "tree", head: tree.head, nodes: tree.nodes, src: blockSrc([tree.head].concat(tree.raw)) });
      para = null; dia = null; flow = null; tree = null;
    }

    lines.forEach(function (line) {
      if (line.trim() === "") { flush(); return; }
      if (dia) { dia.lines.push(line); return; }
      if (flow) { flow.raw.push(line); flow.rows.push(flowRow(line, flow.rows[flow.rows.length - 1])); return; }
      if (tree) { tree.raw.push(line); tree.nodes.push(treeLine(line)); return; }
      var head = line.trim();
      var kind = Object.prototype.hasOwnProperty.call(tokens, head) ? tokens[head] : "";
      if (kind === "dia") { flush(); dia = { head: head, lines: [] }; return; }
      if (kind === "flow") { flush(); flow = { head: head, rows: [], raw: [] }; return; }
      if (kind === "tree") { flush(); tree = { head: head, nodes: [], raw: [] }; return; }
      if (!para) para = { lines: [], raw: [] };
      para.raw.push(line);
      para.lines.push(inline(line));
    });
    flush();
    return out;
  }

  // The word for a card, in one of three endings, then NN - the pattern below is the literal
  // and is written in escapes for the same reason the tags are. The two endings it leaves out
  // are a genitive and a count, and a bare number is an argument, not a card. NN is the number
  // on the cell in the rail, which is the only number of a card he has ever been shown.
  //
  // A run is cut into pieces here rather than in the shell, so the pattern is checked without a
  // browser, and it hands back pieces rather than a string of HTML for the same reason the
  // markup does: the shell builds the nodes, and an author's text has no path to innerHTML.
  // `n` is the card's number, or 0 for a piece that is ordinary text.
  var CARD_REF = /\u043a\u0430\u0440\u0442\u043e\u0447\u043a[\u0430\u0443\u0435]\s+(\d{1,3})(?!\d)/gi;

  function refSplit(text) {
    var out = [];
    if (typeof text !== "string" || text === "") return out;
    var re = new RegExp(CARD_REF.source, "gi");
    var at = 0, m;
    while ((m = re.exec(text)) !== null) {
      // A word that merely ends in the pointer word points at nothing. \b is no help here: it is
      // spelled in ASCII word characters and every Cyrillic letter is a non-word to it.
      if (isWordChar(text.charAt(m.index - 1))) continue;
      var n = parseInt(m[1], 10);
      if (!(n > 0)) continue;
      if (m.index > at) out.push({ t: text.slice(at, m.index), n: 0 });
      out.push({ t: m[0], n: n });
      at = m.index + m[0].length;
    }
    if (at < text.length) out.push({ t: text.slice(at), n: 0 });
    return out;
  }

  // One hash per block of an answer, in the order they render. It is the same hash the card's
  // stamp is made with, because «this piece changed» and «this card changed» are one
  // question asked of two sizes of text, and a second hash function would be a second answer.
  function blockHashes(text) {
    return markup(text).map(function (b) { return stamp(b.src); });
  }

  // Both blocks of a card, in the order the screen draws them: the notes first, because they
  // stand above the answer, then the answer itself. The set of blocks he has read is one
  // set per card and not one per field, which is what lets a block the author moves out of `a`
  // and into `n` unchanged go on reading as seen - it is the same text, and the hash is of the
  // text. The order lives here rather than in the shell so «notes above the answer» is a check
  // on the model and needs no browser.
  function cardHashes(card) {
    if (!card) return [];
    return blockHashes(card.clar).concat(blockHashes(card.answer));
  }

  // The whole of the slider's filter, here and not in the shell so it is checked without a
  // browser: a card clears the level, or it carries no weight and clears every level.
  function shows(card, level) { return !card || !card.w || card.w >= level; }

  function readScales(raw, errors) {
    var out = {};
    var src = raw.scales || {};
    Object.keys(src).forEach(function (name) {
      var s = src[name];
      var labels = arr(s && s.labels).filter(isText);
      if (labels.length < 2) {
        errors.push({ where: "scales." + name, what: S("err_scale_two") });
        return;
      }
      out[name] = Object.freeze({ id: name, labels: Object.freeze(labels), note: isText(s.note) ? s.note : "" });
    });
    return out;
  }

  // The deck declares its own marks; the engine hard-codes none. A deck with no right
  // answer simply never declares "I know it", so the label cannot lie.
  function readMarks(raw, errors) {
    var out = [], seen = {};
    arr(raw.marks).forEach(function (m, i) {
      var id = m && m.id;
      if (!isText(id)) { errors.push({ where: "marks[" + i + "]", what: S("err_mark_no_id") }); return; }
      if (seen[id]) { errors.push({ where: "marks." + id, what: S("err_mark_dup_id") }); return; }
      if (!isText(m.label)) { errors.push({ where: "marks." + id, what: S("err_mark_no_label") }); return; }
      if (SIDES.indexOf(m.side) < 0) { errors.push({ where: "marks." + id, what: S("err_mark_side") }); return; }
      seen[id] = true;
      out.push(Object.freeze({ id: id, label: m.label, side: m.side, key: isText(m.key) ? m.key : "" }));
    });
    return out;
  }

  function readReply(card, scales, errors, where) {
    var r = card.reply;
    if (r == null) return Object.freeze({ mode: "text" });
    if (typeof r === "string") r = { mode: r };
    var mode = r.mode;
    if (REPLY_MODES.indexOf(mode) < 0) {
      errors.push({ where: where, what: S("err_reply_mode", mode, REPLY_MODES.join(" \u00b7 ")) });
      mode = "text";
    }
    if (mode === "scale") {
      if (!scales[r.scale]) {
        errors.push({ where: where, what: S("err_scale_missing", r.scale) });
        return Object.freeze({ mode: "text" });
      }
      return Object.freeze({ mode: "scale", scale: r.scale });
    }
    if (mode === "choice") {
      var opts = arr(r.options).filter(isText);
      if (opts.length < 2) {
        errors.push({ where: where, what: S("err_choice_empty") });
        return Object.freeze({ mode: "text" });
      }
      return Object.freeze({ mode: "choice", options: Object.freeze(opts), many: !!r.many });
    }
    return Object.freeze({ mode: mode });
  }

  // (is there a prepared answer?) x (is it hidden?) x (is an answer wanted) - nothing else.
  function deriveForm(hasAnswer, gated, mode) {
    if (hasAnswer) {
      if (!gated) return "read";
      return mode === "none" ? "read" : "recall";
    }
    return mode === "none" ? "talk" : "self";
  }

  // A card the reader cannot use is dropped rather than shown broken: without an id there is
  // nowhere to put his answer, and without a question there is nothing to answer.
  function readCard(c, block, index, deck, scales, errors) {
    var place = S("err_where_card", block.t || S("deck_block_n", block.n), index + 1);
    var where = isText(c.id) ? place + " · " + c.id : place;
    if (!isText(c.id)) {
      errors.push({ where: where, what: S("err_card_no_id") });
      return null;
    }
    if (!isText(c.q)) {
      errors.push({ where: where, what: S("err_card_no_q") });
      return null;
    }

    var gated = c.gate === undefined ? deck.gate : !!c.gate;
    var reply = readReply(c, scales, errors, where);
    var hasAnswer = isText(c.a);
    // The card's upper block: the answers to his own questions and the terms he asked about,
    // written in the same markup as `a`. It is optional, it never replaces the answer, and it
    // has no say in the form: a card is `recall` or `read` because of the answer, not
    // because something was explained above it.
    var clar = isText(c.n) ? c.n : "";
    // How much of the time he has this card is worth: an integer 1..100 the author writes, and
    // absent is not zero. A card with no weight is shown at every level, so a deck that never
    // opted in is the deck it was. It is deliberately left out of `authored` below - a weight is
    // the author's judgement about a card, never a word on it, and a re-weighted deck coming up
    // «new in this round» from end to end is exactly the failure that stamp exists to avoid.
    var w = parseInt(c.w, 10);
    if (!(w >= 1 && w <= 100)) w = 0;
    var material = {
      d: isText(c.d) ? c.d : "",
      code: isText(c.code) ? c.code : "",
      dia: isText(c.dia) ? c.dia : "",
      dia2: isText(c.dia2) ? c.dia2 : ""
    };
    // The stamp covers everything the author wrote and nothing the reader wrote - a changed
    // stamp is what "new in this round" means, so there is no rev bookkeeping and no
    // mark is ever destroyed to raise it.
    // The assistant's replies to him, per round. His own half never appears in data.js.
    var from = arr(c.from).filter(function (m) { return m && isText(m.t); }).map(function (m) {
      return Object.freeze({ round: parseInt(m.round, 10) || 0, t: m.t });
    });
    // `n` joins the stamp only when the author actually wrote one, so that every card written
    // before this field existed hashes to exactly the string it hashed to yesterday. Adding the
    // field unconditionally would have put one more separator into every card in every deck and
    // turned the whole of every deck «new in this round» on the next load, which is the one
    // failure this stamp exists to avoid. A rewritten note changes the stamp, which is the
    // part that was asked for.
    var authored = [c.q, c.a, c.tag, material.d, material.code, material.dia, material.dia2]
      .concat(clar ? [clar] : [])
      .concat(from.map(function (m) { return m.round + ":" + m.t; })).join(" ");

    return Object.freeze({
      id: c.id,
      block: block.n,
      index: index,
      q: c.q,
      tag: isText(c.tag) ? c.tag : "",
      answer: hasAnswer ? c.a : null,
      clar: clar,
      w: w,
      material: Object.freeze(material),
      gated: gated,
      reply: reply,
      form: deriveForm(hasAnswer, gated, reply.mode),
      ref: Object.freeze(arr(c.ref).filter(isText)),
      from: Object.freeze(from),
      stamp: stamp(authored)
    });
  }

  function build(raw) {
    var errors = [];
    raw = raw || {};
    if (!isText(raw.key)) errors.push({ where: "deck", what: S("err_deck_no_key") });

    var round = parseInt(raw.round, 10);
    if (!(round > 0)) {
      if (raw.round !== undefined) errors.push({ where: "deck", what: S("err_deck_round") });
      round = 1;
    }

    var scales = readScales(raw, errors);
    var marks = readMarks(raw, errors);
    var deck = { gate: raw.gate === undefined ? true : !!raw.gate };

    var byId = {}, cards = [], blocks = [], skipped = 0;
    arr(raw.blocks).forEach(function (b, bi) {
      b = b || {};
      var block = {
        n: b.n !== undefined ? b.n : bi + 1,
        t: isText(b.t) ? b.t : "",
        note: isText(b.note) ? b.note : "",
        min: isText(b.min) ? b.min : "",
        cards: []
      };
      arr(b.q).forEach(function (c, ci) {
        var card = readCard(c || {}, block, ci, deck, scales, errors);
        if (!card) { skipped++; return; }
        if (byId[card.id]) {
          errors.push({
            where: S("err_where_card", block.t || S("deck_block_n", block.n), ci + 1) + " \u00b7 " + card.id,
            what: S("err_card_dup_id")
          });
          skipped++;
          return;
        }
        byId[card.id] = card;
        block.cards.push(card);
        cards.push(card);
      });
      block.cards = Object.freeze(block.cards);
      blocks.push(Object.freeze(block));
    });

    if (!cards.length) errors.push({ where: "deck", what: S("err_deck_empty") });

    // The assistant's word about the round as a whole, the same shape as a card's `from`.
    var deckFrom = arr(raw.from).filter(function (m) { return m && isText(m.t); }).map(function (m) {
      return Object.freeze({ round: parseInt(m.round, 10) || 0, t: m.t });
    });

    return Object.freeze({
      key: isText(raw.key) ? raw.key : "",
      round: round,
      title: isText(raw.title) ? raw.title : "",
      copyPrefix: isText(raw.copyPrefix) ? raw.copyPrefix : (isText(raw.title) ? raw.title : ""),
      gate: deck.gate,
      scales: Object.freeze(scales),
      marks: Object.freeze(marks),
      markById: Object.freeze(marks.reduce(function (m, x) { m[x.id] = x; return m; }, {})),
      blocks: Object.freeze(blocks),
      cards: Object.freeze(cards),
      byId: Object.freeze(byId),
      from: Object.freeze(deckFrom),
      // Whether this deck opted into weights at all. One card is enough, and no card at all is
      // what keeps the slider off a deck that never asked for one.
      weighted: cards.some(function (c) { return c.w > 0; }),
      errors: Object.freeze(errors),
      skipped: skipped
    });
  }

  return { build: build, stamp: stamp, markup: markup, blockHashes: blockHashes,
    cardHashes: cardHashes, refSplit: refSplit, tagKey: tagKey, shows: shows,
    REPLY_MODES: REPLY_MODES };
});
