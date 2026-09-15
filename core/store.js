// Everything the reader writes. One localStorage key for the whole deck, one record per
// (question, round). The key is written once and never bumped - a new key is an empty
// bucket, which is how 36 cards were orphaned once (D-058).
(function (root, factory) {
  // The accessor, not the text: what the reader is told lives in core/strings.*.js.
  var get = typeof module === "object" && module.exports
    ? function () { return require("./strings.js"); }
    : function () { return root.DeckStrings; };
  var api = factory(get);
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.DeckStore = api;
})(typeof self !== "undefined" ? self : this, function (get) {
  // Resolved on every call and never captured: a deck page written before the table existed
  // fetches it after this file has already run, so there is nothing to hold on to at load.
  function S() { return get().apply(null, arguments); }
  S.n = function (count, key) { return get().n(count, key); };


  // 2: the read sets written under the old rule are dropped once, on the first load under this
  // number. Every card of every deck had been marked read simply by being navigated past, so the
  // whole page came up dimmed and the fix alone could not undim it: it stopped new marks and left
  // the wrong old ones standing. Nothing else in the bucket is touched by the bump.
  var SCHEMA = 2;

  function blank() {
    return { my: "", draft: "", val: null, mark: null, discuss: false, msgs: [], told: "", sent: 0, seen: "", qs: "", at: 0 };
  }

  function isText(v) { return typeof v === "string" && v.trim() !== ""; }
  function recKey(id, round) { return id + "|" + round; }

  function empty() { return { v: SCHEMA, cards: {}, extra: {}, prefs: {}, flags: {}, read: {} }; }

  // The two toggles are about the card, not about a round of it: «hard» does not stop being
  // true because a new round started, and that is the whole point of being able to come back to
  // it. So they live beside `cards` rather than inside a record, keyed by card id alone.
  // A bucket written before this existed simply has no `flags`, which reads as {} and means
  // every card starts at its default - nothing to migrate and nothing that can be lost.
  var FLAGS = ["prio", "diff"];

  function create(opts) {
    opts = opts || {};
    var key = opts.key;
    var round = opts.round || 1;
    var storage = opts.storage || (typeof localStorage !== "undefined" ? localStorage : null);
    var onError = opts.onError || function () {};
    var now = opts.now || function () { return Date.now(); };
    var data = empty();
    var lastError = null;

    function load() {
      if (!storage || !key) return;
      var text = null;
      try { text = storage.getItem(key); } catch (e) { lastError = e; onError("read", e); return; }
      if (!text) return;
      try {
        var parsed = JSON.parse(text);
        if (parsed && typeof parsed === "object" && parsed.cards) {
          var was = typeof parsed.v === "number" ? parsed.v : 0;
          data = { v: SCHEMA, cards: parsed.cards || {}, extra: parsed.extra || {},
            prefs: parsed.prefs || {}, flags: parsed.flags || {}, read: parsed.read || {} };
          // The one-time wipe. A bucket written under an older number carries read sets made by
          // the old rule, and the only honest thing to do with them is throw them away: he never
          // confirmed a single one of those cards. Read sets and nothing else - his answers,
          // drafts, marks, messages, toggles and prefs come across untouched - and the new number
          // is written back in the same breath, so it happens once per browser and never again.
          if (was < SCHEMA) { data.read = {}; save(); }
        } else if (parsed && typeof parsed === "object") {
          // An old flat bucket sitting under this key. Never rewritten in place: adopt() is
          // an explicit, one-shot conversion the reader asks for.
          lastError = new Error("old-format");
          onError("old-format", parsed);
        }
      } catch (e) { lastError = e; onError("parse", e); }
    }

    // The old engine swallowed every write failure. This one reports it, because a full
    // quota is the one condition where his answers stop being saved without a symptom.
    function save() {
      if (!storage || !key) return false;
      try { storage.setItem(key, JSON.stringify(data)); return true; }
      catch (e) { lastError = e; onError("write", e); return false; }
    }

    function get(id, r) {
      return data.cards[recKey(id, r === undefined ? round : r)] || null;
    }

    function rec(id, r) { return get(id, r) || blank(); }

    function patch(id, fields, r) {
      var k = recKey(id, r === undefined ? round : r);
      var cur = data.cards[k] || blank();
      Object.keys(fields).forEach(function (f) { cur[f] = fields[f]; });
      cur.at = now();
      data.cards[k] = cur;
      save();
      return cur;
    }

    function setDraft(id, text) { return patch(id, { draft: typeof text === "string" ? text : "" }); }

    function setValue(id, val) { return patch(id, { val: val }); }

    // Passing the gate. "my" is his final wording for this round; the draft stays as it is
    // so reopening the card shows what he was still typing.
    function answer(id, how) {
      var cur = rec(id);
      var told = how === "skip" ? "skip" : "my";
      var my = told === "my" ? String(cur.draft || cur.my || "").trim() : cur.my;
      return patch(id, { my: my, told: told });
    }

    function setMark(id, markId) {
      var cur = rec(id);
      return patch(id, { mark: cur.mark === markId ? null : markId });
    }

    function setDiscuss(id, on) {
      var cur = rec(id);
      return patch(id, { discuss: on === undefined ? !cur.discuss : !!on });
    }

    function addMsg(id, text) {
      if (!isText(text)) return null;
      var cur = rec(id);
      var msgs = (cur.msgs || []).slice();
      msgs.push({ t: String(text).trim(), at: now() });
      return patch(id, { msgs: msgs });
    }

    // Answering also photographs the question he was answering. That photograph is the only
    // honest source for «was · round N» when the author rewrites the wording next round: the
    // deck file carries the new text only, and the record carries what he actually read.
    function see(id, cardStamp, question) {
      var fields = { seen: cardStamp };
      if (isText(question)) fields.qs = String(question);
      return patch(id, fields);
    }

    // The newest earlier round in which he answered a differently worded version of this card.
    function asked(id, nowText) {
      var best = null;
      Object.keys(data.cards).forEach(function (k) {
        var cut = k.lastIndexOf("|");
        if (k.slice(0, cut) !== id) return;
        var r = parseInt(k.slice(cut + 1), 10);
        if (r >= round) return;
        var q = data.cards[k].qs;
        if (!isText(q) || q === nowText) return;
        if (!best || r > best.round) best = { round: r, q: q };
      });
      return best;
    }

    // A verbatim write, timestamp included: this is how undo puts a record back exactly as it
    // was, rather than laying a new edit on top of the old one.
    function put(id, record, r) {
      var k = recKey(id, r === undefined ? round : r);
      if (record === null) delete data.cards[k];
      else data.cards[k] = record;
      save();
      return record;
    }

    function lastSeen(id) {
      var best = null, bestRound = -1;
      Object.keys(data.cards).forEach(function (k) {
        var cut = k.lastIndexOf("|");
        if (k.slice(0, cut) !== id) return;
        var r = parseInt(k.slice(cut + 1), 10);
        var s = data.cards[k].seen;
        if (isText(s) && r > bestRound) { bestRound = r; best = s; }
      });
      return best;
    }

    // What "new in this round" means: the authored half of the card differs from the one he
    // last looked at. No rev field, no author bookkeeping, and no mark destroyed to raise it.
    function isNew(card) {
      var seen = lastSeen(card.id);
      return seen !== null && seen !== card.stamp;
    }

    function touched(id, r) {
      var s = get(id, r);
      if (!s) return false;
      return isText(s.my) || isText(s.draft) || s.val !== null || !!s.mark || !!s.discuss ||
        (s.msgs && s.msgs.length > 0) || s.told === "skip";
    }

    function history(id) {
      var out = [];
      Object.keys(data.cards).forEach(function (k) {
        var cut = k.lastIndexOf("|");
        if (k.slice(0, cut) !== id) return;
        var r = parseInt(k.slice(cut + 1), 10);
        if (r === round) return;
        out.push({ round: r, rec: data.cards[k] });
      });
      return out.sort(function (a, b) { return b.round - a.round; });
    }

    function markSent(ids) {
      ids.forEach(function (id) { patch(id, { sent: round }); });
      return save();
    }

    // The two numbers that only ever fall.
    function stats(model) {
      var untouched = 0, unsent = 0;
      model.cards.forEach(function (c) {
        if (!touched(c.id)) { untouched++; return; }
        var s = get(c.id);
        if (!s || s.sent !== round) unsent++;
      });
      return { untouched: untouched, unsent: unsent };
    }

    function extra(text) {
      if (text === undefined) return data.extra[round] || "";
      data.extra[round] = String(text);
      save();
      return data.extra[round];
    }

    // Per card, per deck, never per round. Reading an unset flag gives undefined, which is how
    // "he has never touched this toggle" stays distinguishable from "he set it to false" - the
    // filter needs that difference, because a deck of cards nobody has judged is not a deck of
    // cards he deliberately put aside.
    function flag(id, name, value) {
      if (FLAGS.indexOf(name) < 0) return undefined;
      var box = data.flags[id];
      if (value === undefined) return box ? box[name] : undefined;
      if (!box) box = data.flags[id] = {};
      if (value === null) delete box[name];
      else box[name] = !!value;
      if (!Object.keys(box).length) delete data.flags[id];
      save();
      return value === null ? undefined : !!value;
    }

    // Put aside on purpose: too hard for now, or pushed down the list on purpose. An untouched
    // toggle is not "set aside" - see flag() for why that difference is kept.
    function setAside(id) {
      return flag(id, "diff") === true || flag(id, "prio") === false;
    }

    // ---- what he has already read, block by block ------------------------------------------
    //
    // A set of block hashes per card, beside `cards` rather than inside a record, for the same
    // reason `flags` is: a paragraph he read does not become unread because the author bumped
    // the round, and the record shape must not gain a field for it. The shell writes the whole
    // set once, when he leaves a card, and reads it back on render: a block whose hash is in the
    // set is one he has already been shown, so it steps to the right and dims, and a block whose
    // hash is not is new or rewritten and stays flush left at full contrast.
    //
    // It cannot grow without bound: markRead replaces the set with the hashes of the text as it
    // stood at that leave, so the set is never longer than the number of blocks on the card.
    // A rewritten block falls out of it by itself - the old hash is no longer in the text and
    // the new one was never recorded, which is exactly what makes the rewrite read as new.
    function readBlocks(id) {
      var got = data.read[id];
      return Array.isArray(got) ? got.slice() : [];
    }

    function markRead(id, hashes) {
      if (!isText(id) || !Array.isArray(hashes)) return false;
      var set = [];
      hashes.forEach(function (h) { if (isText(h) && set.indexOf(h) < 0) set.push(h); });
      if (set.length) data.read[id] = set;
      else delete data.read[id];
      return save();
    }

    // WHICH WAY OUT OF A CARD RECORDS WHAT IT SHOWED, and it is a closed list of one. His rule,
    // in his own words: «a card is read only when I move on to the next one through the
    // arrow». The › on the card is that gesture, and it is the same press that writes his
    // answer, so «the arrow» and «sent the answer» are one route here and not two. Every other
    // way out - the rail, the search, a pointer in the prose, ×, «reread», J and K, the tab
    // closing - is him moving around the deck, and moving around is not reading.
    //
    // It was `wrote(id)` for one commit, an answer or a draft standing in the box, and that was
    // still a side effect of navigation rather than an act of his: he wants to say so himself.
    // The list lives here rather than in the shell so it is checkable without a browser, and
    // core/selftest.js pins both the list and the single call site in the shell.
    var READS = ["arrow"];

    function marksRead(route) { return READS.indexOf(route) >= 0; }

    function leaveRead(id, hashes, route) {
      if (!marksRead(route)) return false;
      return markRead(id, hashes);
    }

    function wasRead(id, hash) {
      return readBlocks(id).indexOf(hash) >= 0;
    }

    // «Reset what you have read»: every card back to nothing read. It touches nothing he wrote,
    // which is why it is not behind the confirmation «Erase everything» is behind.
    function forgetRead() {
      data.read = {};
      return save();
    }

    // ---- the queue -----------------------------------------------------------------------
    //
    // Has he written anything on this card in this round? A draft counts: it is on the screen,
    // he can read it back, and the only thing it lacks is the press of the button.
    function wrote(id, r) {
      var s = get(id, r);
      return !!(s && ((s.my && s.my.trim()) || (s.draft && s.draft.trim())));
    }

    // «Reread» is the mark on his own side of the line, and what it means depends on whether
    // there is anything written under it. Over an empty card it means «not now», so the card
    // leaves the queue and its cell greys out. Over a card he has already answered it means
    // «let me read the answer first», so the card stays where it is - and the sent form
    // does not report it as a reread either, because it is not one.
    function reread(id, side) {
      return side === "mine" && !wrote(id);
    }

    function hidden(id, side) {
      return reread(id, side) && !review();
    }

    // «Repeat everything»: hidden cards come back. Kept in this deck's own bucket, so it is per
    // deck and survives a reload, which is what makes it a mode and not a button.
    function review(on) {
      if (on !== undefined) pref("review", !!on);
      return data.prefs.review === true;
    }

    // Four ways a card leaves or keeps its place, and the button that causes each one:
    //   X            closed for good, never offered again
    //   reread       see above: out of the queue while nothing is written, in it once there is
    //   Skip         no status at all, comes back
    //   an answer    dealt with, drops out, but the X is still what closes it
    // `side` is the side of the mark the card carries, which is the only thing the engine may
    // read: the deck declares its own marks and this file hard-codes none of their ids.
    function inQueue(id, side) {
      if (side === "done") return false;
      if (hidden(id, side)) return false;
      if (side === "mine") return true;
      var s = get(id);
      if (!s) return true;
      if (s.told === "skip" && !(s.my && s.my.trim())) return true;
      return !touched(id);
    }

    function pref(name, value) {
      if (value === undefined) return data.prefs[name];
      data.prefs[name] = value;
      save();
      return value;
    }

    function exportAll() {
      return JSON.stringify({ deck: key, v: SCHEMA, at: now(), data: data }, null, 2);
    }

    // Merge never deletes and never overwrites something newer than what it carries;
    // replace is the reader saying so out loud.
    function importAll(text, mode) {
      var parsed;
      try { parsed = JSON.parse(text); } catch (e) { return { ok: false, why: S("store_bad_file"), added: 0, updated: 0 }; }
      var incoming = parsed && parsed.data ? parsed.data : parsed;
      if (!incoming || typeof incoming !== "object" || !incoming.cards) {
        return { ok: false, why: S("store_no_records"), added: 0, updated: 0 };
      }
      if (mode === "replace") {
        data = { v: SCHEMA, cards: incoming.cards || {}, extra: incoming.extra || {},
          prefs: incoming.prefs || {}, flags: incoming.flags || {}, read: incoming.read || {} };
        return { ok: save(), why: "", added: Object.keys(data.cards).length, updated: 0 };
      }
      var added = 0, updated = 0;
      Object.keys(incoming.cards).forEach(function (k) {
        var mine = data.cards[k], theirs = incoming.cards[k];
        if (!mine) { data.cards[k] = theirs; added++; return; }
        if ((theirs.at || 0) > (mine.at || 0)) { data.cards[k] = theirs; updated++; }
      });
      Object.keys(incoming.extra || {}).forEach(function (r) {
        if (!isText(data.extra[r])) data.extra[r] = incoming.extra[r];
      });
      // A toggle carries no timestamp, so merge cannot tell which side is newer. It only fills
      // in what this browser has never decided, and never overwrites a decision made here.
      Object.keys(incoming.flags || {}).forEach(function (id) {
        var theirs = incoming.flags[id];
        if (!theirs || typeof theirs !== "object") return;
        var mine = data.flags[id] || (data.flags[id] = {});
        FLAGS.forEach(function (f) {
          if (typeof theirs[f] === "boolean" && typeof mine[f] !== "boolean") mine[f] = theirs[f];
        });
        if (!Object.keys(mine).length) delete data.flags[id];
      });
      // A read-set carries no timestamp either, and it is the same rule: fill in a card this
      // browser has never recorded, never overwrite one it has. Merging the two sets instead
      // would be the one way this thing can grow without bound.
      Object.keys(incoming.read || {}).forEach(function (id) {
        if (Array.isArray(incoming.read[id]) && !data.read[id]) data.read[id] = incoming.read[id].slice();
      });
      return { ok: save(), why: "", added: added, updated: updated };
    }

    // One-shot read of an old flat bucket into round-keyed records. It never writes to the
    // old key, so the frozen engine keeps working on its own decks.
    function adopt(oldBucket, intoRound, mapMark) {
      var map = mapMark || function (status) { return status === "ok" || status === "rep" ? status : null; };
      var r = intoRound || 1;
      var taken = 0;
      Object.keys(oldBucket || {}).forEach(function (id) {
        if (id.indexOf("__") === 0) return;
        var o = oldBucket[id];
        if (!o || typeof o !== "object") return;
        var msgs = (Array.isArray(o.msgs) ? o.msgs : [])
          .filter(function (m) { return m && m.w === "you" && isText(m.t); })
          .map(function (m) { return { t: m.t, at: 0 }; });
        var k = recKey(id, r);
        if (data.cards[k]) return;
        data.cards[k] = {
          my: isText(o.my) ? o.my : "",
          draft: isText(o.draft) ? o.draft : "",
          val: null,
          mark: map(o.status),
          discuss: o.status === "talk",
          msgs: msgs,
          told: o.told === "my" || o.told === "skip" ? o.told : "",
          sent: 0,
          seen: "",
          at: 0
        };
        taken++;
      });
      save();
      return taken;
    }

    load();

    return {
      key: key,
      round: round,
      schema: SCHEMA,
      get: get, rec: rec, patch: patch,
      setDraft: setDraft, setValue: setValue, answer: answer,
      setMark: setMark, setDiscuss: setDiscuss, addMsg: addMsg,
      see: see, lastSeen: lastSeen, isNew: isNew, asked: asked, put: put,
      touched: touched, history: history, markSent: markSent, stats: stats,
      extra: extra, pref: pref, flag: flag, setAside: setAside,
      readBlocks: readBlocks, markRead: markRead, leaveRead: leaveRead, marksRead: marksRead,
      wasRead: wasRead, forgetRead: forgetRead,
      wrote: wrote, reread: reread, hidden: hidden, review: review, inQueue: inQueue,
      exportAll: exportAll, importAll: importAll, adopt: adopt,
      raw: function () { return data; },
      error: function () { return lastError; }
    };
  }

  return { create: create, SCHEMA: SCHEMA, blank: blank, FLAGS: FLAGS };
});
