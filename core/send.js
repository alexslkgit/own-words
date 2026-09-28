// Sending is rendering a filled form, not copying blind: the same text this builds is what he
// reads on screen before anything reaches the clipboard.
(function (root, factory) {
  // The accessor, not the text: the form is assembled out of core/strings.*.js, counted
  // nouns included - S.n() asks the table's own pluraliser, so this file counts nothing itself.
  var get = typeof module === "object" && module.exports
    ? function () { return require("./strings.js"); }
    : function () { return root.DeckStrings; };
  // The model the same way, for the one count and the one hash the request and the reply check
  // share with the page: a budget counted twice is a budget counted two ways.
  var getModel = typeof module === "object" && module.exports
    ? function () { return require("./model.js"); }
    : function () { return root.DeckModel; };
  var api = factory(get, getModel);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DeckSend = api;
})(typeof self !== "undefined" ? self : this, function (get, getModel) {
  // Resolved on every call and never captured: a deck page written before the table existed
  // fetches it after this file has already run, so there is nothing to hold on to at load.
  function S() { return get().apply(null, arguments); }
  S.n = function (count, key) { return get().n(count, key); };


  function saidBy(model, card, rec) {
    if (rec.my) return rec.my;
    // Typed but never passed through the gate: it still goes out, marked, because a form that
    // says «1 answer» over an empty line is worse than showing him what he did not send.
    if (rec.draft && rec.draft.trim()) return S("send_draft_mark", rec.draft.trim());
    if (rec.val === null || rec.val === undefined) return "";
    if (card.reply.mode === "scale") {
      var s = model.scales[card.reply.scale];
      return s && s.labels[rec.val] !== undefined ? s.labels[rec.val] : String(rec.val);
    }
    if (card.reply.mode === "choice") {
      var v = Array.isArray(rec.val) ? rec.val : [rec.val];
      return v.map(function (i) { return card.reply.options[i]; }).filter(Boolean).join(", ");
    }
    return String(rec.val);
  }

  // The mark, and nothing else. «Discuss» used to be a flag he raised by hand; it is now
  // simply whether he wrote anything, and what he wrote is printed on the next line already.
  //
  // One mark is not printed: «reread» over an answer he has already written. He presses it
  // there to read the reply first, not to say he failed the card, and the card never leaves the
  // queue for it either - see store.reread(). The flag is still on the record, so nothing is
  // lost; it is only this form that does not claim something he did not mean.
  function tags(model, rec, wrote) {
    var out = [];
    var m = rec.mark ? model.markById[rec.mark] : null;
    if (m && !(m.side === "mine" && wrote)) out.push(m.label);
    return out.length ? " [" + out.join(" · ") + "]" : "";
  }

  // scope: null for the whole deck, or a block number.
  function build(model, store, scope) {
    var answered = [], opened = [], untouched = [], ids = [], fresh = 0, asked = 0;

    model.cards.forEach(function (card, i) {
      if (scope != null && card.block !== scope) return;
      var num = (i + 1 < 10 ? "0" : "") + (i + 1);
      var rec = store.get(card.id);
      if (!rec || !store.touched(card.id)) { untouched.push(num); return; }

      ids.push(card.id);
      if (rec.sent !== store.round) fresh++;
      var mine = saidBy(model, card, rec);
      var msgs = (rec.msgs || []).map(function (m) { return m.t; });
      asked += msgs.length;

      var lines = [num + " \u00b7 " + card.q + tags(model, rec, store.wrote(card.id)) +
        (rec.sent !== store.round ? " " + S("send_new_tag") : "")];
      if (mine) lines.push(indent(mine));
      msgs.forEach(function (t) { lines.push(indent(S("send_question", t))); });

      if (!mine && rec.told === "skip") opened.push(lines.join("\n"));
      else answered.push(lines.join("\n"));
    });

    var head = [model.copyPrefix || model.key, S("round_n", store.round)];
    if (answered.length) head.push(answered.length + " " + S.n(answered.length, "answers_n"));
    if (fresh) head.push(S("send_fresh", fresh, S.n(fresh, "new_n")));
    if (asked) head.push(asked + " " + S.n(asked, "questions_n"));
    if (opened.length) head.push(S("send_opened", opened.length));

    var out = [head.join(" \u00b7 ")];
    if (answered.length) out.push("", S("send_h_answers"), "", answered.join("\n\n"));
    if (opened.length) out.push("", S("send_h_opened"), "", opened.join("\n\n"));
    if (untouched.length) out.push("", S("send_h_untouched"), "", untouched.join(" "));

    var extra = store.extra();
    if (extra && extra.trim()) out.push("", S("send_h_extra"), "", extra.trim());

    return {
      text: out.join("\n"),
      ids: ids,
      counts: {
        answered: answered.length,
        opened: opened.length,
        untouched: untouched.length,
        fresh: fresh,
        asked: asked
      }
    };
  }

  function indent(text) {
    return String(text).split("\n").map(function (l) { return "   " + l; }).join("\n");
  }

  // ---- simpler, and never longer: the request and the reply ---------------------------------
  //
  // The page is static and the AI runs outside it, so a simpler answer is one more thing this
  // file sends: a filled form he reads and then copies, exactly like the round's form above.
  // It is a different KIND of form, and the first line says so in a fixed token, so whatever
  // reads it - a skill in Claude Code, a person in any chat - can tell it from a round's answers.
  //
  // The token, the field names and the reply block are a protocol and not prose: they are the
  // same in every language the page is read in, which is why they are literals here and not
  // keys in a strings table. Everything a person reads around them goes through S().
  var KINDS = { simple: "[own-words simplify]", deeper: "[own-words deeper]" };
  var FENCE = "own-words";

  function pad(n) { return (n < 10 ? "0" : "") + n; }

  // ask: { kind: "simple" | "deeper", text: the text on screen, words: [..], pieces: [..],
  //        word: the one word a «deeper» request is about }
  // The budget is the word count of the text the request is made FROM: the answer the first
  // time, the simpler version itself for «simpler still». `base` is the stamp of the card's
  // answer, always, so a reply can be matched to the answer it belongs to.
  function simplify(model, card, ask) {
    var M = getModel();
    var kind = ask && ask.kind === "deeper" ? "deeper" : "simple";
    var text = String((ask && ask.text) || card.answer || "");
    var base = M.stamp(card.answer || "");
    var budget = kind === "deeper" ? M.DEEP_MAX : M.words(text);
    var marked = (ask && ask.words) || [];
    var pieces = (ask && ask.pieces) || [];
    var word = String((ask && ask.word) || "");
    var block = model.blocks.filter(function (b) { return b.n === card.block; })[0];

    var out = [KINDS[kind],
      [model.copyPrefix || model.key, S("card_q_n", pad(model.cards.indexOf(card) + 1)),
        S(kind === "deeper" ? "simp_ask_deeper" : "simp_ask_simple")].join(" \u00b7 "),
      "deck: " + model.key,
      "card: " + card.id,
      "base: " + base];
    out.push(kind === "deeper" ? "word: " + word : "budget: " + budget);

    var about = [model.title, block && block.t, card.tag].filter(function (t) { return t; });
    out.push("", S("simp_h_deck"), "", about.join(" \u00b7 "));
    if (model.purpose) out.push(model.purpose);
    out.push("", S("simp_h_question"), "", card.q);
    out.push("", S("simp_h_answer", M.words(text), S.n(M.words(text), "words_n")), "", text);

    if (kind === "simple") {
      if (marked.length) out.push("", S("simp_h_words"), "", marked.join(", "));
      if (pieces.length) out.push("", S("simp_h_pieces"), "", pieces.map(function (p) {
        return indent("\u00ab" + p + "\u00bb");
      }).join("\n"));
      out.push("", S("simp_h_rules"), "", [
        S("simp_rule_1", budget, Math.max(1, Math.round(budget * 2 / 3))),
        S("simp_rule_2"), S("simp_rule_3"), S("simp_rule_4"), S("simp_rule_5"),
        S("simp_rule_6"), S("simp_rule_7"), S("simp_rule_8", M.DEEP_MAX)
      ].map(function (r, i) { return (i + 1) + ". " + r; }).join("\n"));
      out.push("", S("simp_h_reply"), "", S("simp_reply_lead"), "",
        "```" + FENCE, "kind: simple", "card: " + card.id, "base: " + base, "text:",
        S("simp_ph_text"), "removed:", "- " + S("simp_ph_removed"), "```",
        "", S("simp_reply_file", card.id));
    } else {
      out.push("", S("simp_h_rules"), "", [
        S("simp_deep_rule_1", word, M.DEEP_MAX), S("simp_deep_rule_2"), S("simp_deep_rule_3")
      ].map(function (r, i) { return (i + 1) + ". " + r; }).join("\n"));
      out.push("", S("simp_h_reply"), "", S("simp_reply_lead"), "",
        "```" + FENCE, "kind: deeper", "card: " + card.id, "base: " + base, "word: " + word, "text:",
        S("simp_ph_deep", M.DEEP_MAX), "```",
        "", S("simp_reply_file_deep", card.id));
    }
    return { text: out.join("\n"), kind: kind, base: base, budget: budget };
  }

  // The reply comes back as one block, in any of the ways a chat hands text over: the whole
  // message with the fence around it, or only the block's body, which is what a chat's own
  // «copy» button on a code block gives. The last block wins, because the request he may have
  // pasted along with it carries a blank one of its own.
  var OPEN = new RegExp("^\\s*```\\s*" + FENCE + "\\s*$");
  var CLOSE = /^\s*```\s*$/;
  var BARE = /^\s*kind:\s*(simple|deeper)\s*$/;
  var FIELD = /^([a-z]+):\s*(.*)$/;

  function parseReply(pasted) {
    var lines = String(pasted == null ? "" : pasted).replace(/\r\n?/g, "\n").split("\n");
    var from = -1, i;
    for (i = lines.length - 1; i >= 0 && from < 0; i--) if (OPEN.test(lines[i])) from = i + 1;
    for (i = lines.length - 1; i >= 0 && from < 0; i--) if (BARE.test(lines[i])) from = i;
    if (from < 0) return { ok: false, why: S("simp_err_block") };
    var body = [];
    for (i = from; i < lines.length && !CLOSE.test(lines[i]); i++) body.push(lines[i]);

    var head = {}, j = 0, text = [];
    for (; j < body.length; j++) {
      var line = body[j].trim();
      if (!line) continue;
      var f = FIELD.exec(line);
      if (!f) break;
      if (f[1] === "text") { if (f[2].trim()) text.push(f[2].trim()); j++; break; }
      head[f[1]] = f[2].trim();
    }
    var rest = body.slice(j);
    var cut = -1;
    for (i = rest.length - 1; i >= 0; i--) if (rest[i].trim() === "removed:") { cut = i; break; }
    text = text.concat(cut >= 0 ? rest.slice(0, cut) : rest);
    var removed = cut < 0 ? [] : rest.slice(cut + 1).map(function (l) {
      return l.replace(/^\s*(?:[-*\u2022]|\d+[.)])\s*/, "").trim();
    }).filter(function (l) { return l; });
    return {
      ok: true,
      kind: head.kind === "deeper" ? "deeper" : "simple",
      card: head.card || "",
      base: head.base || "",
      word: head.word || "",
      text: text.join("\n").trim(),
      removed: removed
    };
  }

  // What the page accepts, and the budget is the part that is not negotiable: a simpler answer
  // with more words than the text it was made from is refused with the reason, never shown.
  // want: { card, base, budget }. A reply that left `base` out is taken as made from the answer
  // on screen; one that names another base was made from an answer that has since changed.
  function check(reply, want) {
    var M = getModel();
    if (!reply || !reply.ok) return { ok: false, why: (reply && reply.why) || S("simp_err_block") };
    if (reply.card && want.card && reply.card !== want.card) {
      return { ok: false, why: S("simp_err_card", reply.card) };
    }
    if (reply.base && reply.base !== want.base) return { ok: false, why: S("simp_err_base") };
    if (!reply.text) return { ok: false, why: S("simp_err_empty") };
    if (reply.kind === "deeper" && !reply.word) return { ok: false, why: S("simp_err_word") };
    var cap = reply.kind === "deeper" ? M.DEEP_MAX : want.budget;
    var n = M.words(reply.text);
    if (n > cap) {
      return { ok: false, words: n,
        why: S(reply.kind === "deeper" ? "simp_err_deep_long" : "simp_err_long", n, S.n(n, "words_n"), cap) };
    }
    return { ok: true, why: "", words: n };
  }

  return { build: build, simplify: simplify, parseReply: parseReply, check: check, KINDS: KINDS };
});
