// Unit tests for the create_deck validation and packing logic, run with `node --test`.
// This mirrors the checks in src/server.ts (validateDeck) and skills/own-words/link.mjs,
// without spinning up the Worker runtime.

import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const HERE = dirname(fileURLToPath(import.meta.url));
const LZString = (await import(join(HERE, "..", "src", "lz-string.min.js"))).default;

function validateDeck(deck) {
  if (!deck || typeof deck !== "object") {
    return { ok: false, reason: "deck is not an object" };
  }
  if (typeof deck.key !== "string" || !deck.key.trim()) {
    return { ok: false, reason: "deck.key is missing or empty" };
  }
  if (typeof deck.title !== "string" || !deck.title.trim()) {
    return { ok: false, reason: "deck.title is missing or empty" };
  }
  if (!Array.isArray(deck.blocks) || deck.blocks.length === 0) {
    return { ok: false, reason: "deck.blocks is missing or empty" };
  }
  let cardCount = 0;
  for (const block of deck.blocks) {
    if (!block || !Array.isArray(block.q)) {
      return { ok: false, reason: "a block is missing its q array" };
    }
    for (const card of block.q) {
      if (!card || typeof card.q !== "string" || !card.q.trim()) {
        return { ok: false, reason: "a card is missing its q text" };
      }
      if (typeof card.a !== "string" || !card.a.trim()) {
        return { ok: false, reason: "a card is missing its a text" };
      }
      cardCount++;
    }
  }
  if (cardCount === 0) {
    return { ok: false, reason: "deck has no cards" };
  }
  return { ok: true, cardCount };
}

test("rejects a deck missing key", () => {
  const result = validateDeck({});
  assert.equal(result.ok, false);
  assert.match(result.reason, /key/);
});

test("rejects a deck missing title", () => {
  const result = validateDeck({ key: "topic" });
  assert.equal(result.ok, false);
  assert.match(result.reason, /title/);
});

test("rejects a deck with no blocks", () => {
  const result = validateDeck({ key: "topic", title: "Topic" });
  assert.equal(result.ok, false);
  assert.match(result.reason, /blocks/);
});

test("rejects a card missing its answer", () => {
  const deck = {
    key: "topic",
    title: "Topic",
    blocks: [{ n: 1, t: "Block", q: [{ id: "s1", q: "Question?" }] }]
  };
  const result = validateDeck(deck);
  assert.equal(result.ok, false);
  assert.match(result.reason, /a text/);
});

test("accepts a minimal valid deck and counts cards", () => {
  const deck = {
    key: "topic",
    title: "Topic",
    blocks: [
      {
        n: 1,
        t: "Block",
        q: [
          { id: "s1", q: "Question one?", a: "Answer one." },
          { id: "s2", q: "Question two?", a: "Answer two." }
        ]
      }
    ]
  };
  const result = validateDeck(deck);
  assert.equal(result.ok, true);
  assert.equal(result.cardCount, 2);
});

test("packed link round-trips through lz-string back to the original JSON", () => {
  const deck = {
    key: "topic",
    title: "Topic",
    blocks: [{ n: 1, t: "Block", q: [{ id: "s1", q: "Question?", a: "Answer." }] }]
  };
  const json = JSON.stringify(deck);
  const packed = LZString.compressToEncodedURIComponent(json);
  const roundTripped = LZString.decompressFromEncodedURIComponent(packed);
  assert.equal(roundTripped, json);
});

test("validates the real how-own-words-works deck", () => {
  const path = "/Users/slobodianiukoleksandr/Tasks/adhd-plugin/decks/how-own-words-works.json";
  const deck = JSON.parse(readFileSync(path, "utf8"));
  const result = validateDeck(deck);
  assert.equal(result.ok, true);
  assert.ok(result.cardCount > 0);
});
