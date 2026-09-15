/* The paste path, tested in node against the very file index.html loads.
 *
 *   node scripts/parse-deck.test.js
 *
 * The deck arrives in the box as a chat reply, so the cases below are the shapes a chat reply
 * takes - fenced, prefaced, followed by an offer of more cards - and not only the shapes a deck
 * file takes.
 */
const assert = require("assert");
const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const P = require(path.join(ROOT, "scripts/parse-deck.js"));

let n = 0;
function ok(what, fn) { fn(); n++; console.log("ok  " + what); }

// --- accepts -------------------------------------------------------------------------------
ok("bare JSON with blocks", () => {
  const r = P.parseDeckText('{"title":"T","blocks":[{"n":1,"t":"B","q":[{"id":"a","q":"Q?"}]}]}');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.deck.blocks[0].q[0].id, "a");
});

ok("bare JSON with only a key", () => {
  assert.strictEqual(P.parseDeckText('{"key":"k"}').ok, true);
});

ok("window.DECK = {...};", () => {
  const r = P.parseDeckText('window.DECK = {\n  key: "k",\n  blocks: []\n};\n');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.deck.key, "k");
});

ok("DECK = {...} without the window prefix and without the semicolon", () => {
  const r = P.parseDeckText('DECK = { "key": "k2", "blocks": [] }');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.deck.key, "k2");
});

ok("window . DECK with spaces around the dot", () => {
  assert.strictEqual(P.parseDeckText('window . DECK = {"key":"k3"};').ok, true);
});

ok("a BOM and surrounding whitespace", () => {
  assert.strictEqual(P.parseDeckText('﻿\n  {"key":"k4"}  \n').ok, true);
});

ok("JS the JSON parser cannot read: unquoted keys, comments, trailing comma", () => {
  const r = P.parseDeckText('window.DECK = {\n  // a comment\n  key: "k5",\n  blocks: [],\n};');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.deck.key, "k5");
});

// --- the shapes a chat reply arrives in ------------------------------------------------------
ok("a fenced reply: ```json around the deck", () => {
  const r = P.parseDeckText('```json\n{"key":"fenced","blocks":[]}\n```');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.deck.key, "fenced");
});

ok("a fence with no language tag, and one left unclosed", () => {
  assert.strictEqual(P.parseDeckText('```\n{"key":"f2"}\n```').ok, true);
  assert.strictEqual(P.parseDeckText('```json\n{"key":"f3"}').ok, true);
});

ok("a line of preamble before the JSON", () => {
  const r = P.parseDeckText('Here is your deck on the topic you asked about:\n\n{"key":"pre","blocks":[]}');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.deck.key, "pre");
});

ok("chat after the JSON", () => {
  const r = P.parseDeckText('{"key":"post","blocks":[]}\n\nTell me if you want the cards harder.');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.deck.key, "post");
});

ok("the whole chat turn at once: preamble, fence, deck, sign-off", () => {
  const r = P.parseDeckText(
    'Sure. Here is the deck:\n\n```json\n{\n  "key": "whole",\n  "title": "T",\n  "blocks": []\n}\n```\n\nPaste that into the box on the landing page.');
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.deck.key, "whole");
  assert.strictEqual(r.deck.title, "T");
});

ok("the real demo deck on disk", () => {
  const text = fs.readFileSync(path.join(ROOT, "decks/how-own-words-works.json"), "utf8");
  const r = P.parseDeckText(text);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.deck.key, "how-own-words-works");
  assert.strictEqual(r.deck.blocks.length, 2);
});

ok("the real demo deck wrapped in a fenced chat reply", () => {
  const text = fs.readFileSync(path.join(ROOT, "decks/how-own-words-works.json"), "utf8");
  const r = P.parseDeckText("Here you go.\n\n```json\n" + text + "\n```\n\nEight cards.");
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.deck.key, "how-own-words-works");
  assert.strictEqual(r.deck.blocks.length, 2);
});

// --- refuses -------------------------------------------------------------------------------
ok("garbage: no braces anywhere", () => {
  const r = P.parseDeckText("this is not a deck at all");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.why, "I could not find deck JSON in that. Paste from the first { to the last }.");
  assert.strictEqual(r.why, P.NO_JSON);
});

ok("garbage with braces in it, which is still not an object", () => {
  const r = P.parseDeckText("the assistant refused, see {see above} for why");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.why, P.NO_JSON);
});

ok("a deck cut off mid-paste", () => {
  const r = P.parseDeckText('{"key":"cut","blocks":[{"n":1,"q":[{"id":"a","q":"Q?"');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.why, P.NO_JSON);
});

ok("empty text", () => {
  const r = P.parseDeckText("");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.why, P.NO_JSON);
});

ok("null and undefined", () => {
  assert.strictEqual(P.parseDeckText(null).ok, false);
  assert.strictEqual(P.parseDeckText(undefined).ok, false);
});

ok("valid JSON that is not a deck: no key, no blocks", () => {
  const r = P.parseDeckText('{"title":"T"}');
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.why, P.NOT_A_DECK);
});

ok("valid JSON that is not an object", () => {
  assert.strictEqual(P.parseDeckText("[1,2,3]").ok, false);
  assert.strictEqual(P.parseDeckText('"a string"').ok, false);
  assert.strictEqual(P.parseDeckText("null").ok, false);
  assert.strictEqual(P.parseDeckText("42").ok, false);
});

ok("JS that runs but is not a deck object", () => {
  const r = P.parseDeckText("var x = 1;");
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.why, P.NO_JSON);
});

// --- the paste path end to end: parse, pack, unpack, same deck -------------------------------
ok("what the button does: parse, compress, decompress, JSON.parse", () => {
  const LZString = require(path.join(ROOT, "core/vendor/lz-string.min.js"));
  const r = P.parseDeckText('window.DECK = { key: "round-trip", blocks: [{ n: 1, t: "B", q: [{ id: "a", q: "Q?", a: "A" }] }] };');
  assert.strictEqual(r.ok, true);
  const json = JSON.stringify(r.deck);
  const back = JSON.parse(LZString.decompressFromEncodedURIComponent(
    LZString.compressToEncodedURIComponent(json)));
  assert.deepStrictEqual(back, r.deck);
});

// --- the landing must not drift from the engine ----------------------------------------------
ok("the refusal wording is still the engine's own", () => {
  const en = fs.readFileSync(path.join(ROOT, "core/strings.en.js"), "utf8");
  assert.ok(en.indexOf(P.NOT_A_DECK) !== -1, "own_not_a_deck has moved");
});

ok("the storage keys the landing reads are still the engine's own", () => {
  const shell = fs.readFileSync(path.join(ROOT, "core/shell.js"), "utf8");
  assert.ok(shell.indexOf('"ownwords:index"') !== -1, "the index key has moved");
  assert.ok(shell.indexOf('"ownwords:decks:"') !== -1, "the deck key prefix has moved");
});

console.log("\n" + n + " checks, all passed");
