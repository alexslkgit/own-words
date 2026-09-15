// Sending is rendering a filled form, not copying blind: the same text this builds is what he
// reads on screen before anything reaches the clipboard.
(function (root, factory) {
  // The accessor, not the text: the form is assembled out of core/strings.*.js, counted
  // nouns included - S.n() asks the table's own pluraliser, so this file counts nothing itself.
  var get = typeof module === "object" && module.exports
    ? function () { return require("./strings.js"); }
    : function () { return root.DeckStrings; };
  var api = factory(get);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DeckSend = api;
})(typeof self !== "undefined" ? self : this, function (get) {
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

  return { build: build };
});
