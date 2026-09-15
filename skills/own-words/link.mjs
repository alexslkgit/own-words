#!/usr/bin/env node
// own-words — reads a deck JSON file, checks it is shaped like a deck, and prints the
// shareable link: the vendored lz-string carries the whole deck inside the URL hash, so
// the link needs nothing on a server to open.
//
//   node link.mjs <deck.json>

import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const require = createRequire(import.meta.url);
const LZString = require(join(HERE, 'lz-string.min.js'));

const PAGE = 'https://alexslkgit.github.io/own-words/deck.html';

function fail(reason) {
  console.error(reason);
  process.exit(1);
}

const file = process.argv[2];
if (!file) fail('usage: node link.mjs <deck.json>');

let text;
try {
  text = readFileSync(file, 'utf8');
} catch (e) {
  fail(`cannot read ${file}: ${e.message}`);
}

let deck;
try {
  deck = JSON.parse(text);
} catch (e) {
  fail(`not valid JSON: ${e.message}`);
}

if (!deck || typeof deck !== 'object') fail('deck is not an object');
if (typeof deck.key !== 'string' || !deck.key.trim()) fail('deck.key is missing or empty');
if (typeof deck.title !== 'string' || !deck.title.trim()) fail('deck.title is missing or empty');
// The engine hard-codes no marks, so a deck that declares none opens perfectly well and then
// offers the reader no way to close a card. That reads as the tool being broken, which is why
// it is refused here and not defaulted quietly.
if (!Array.isArray(deck.marks) || deck.marks.length === 0) fail('deck.marks is missing');
if (!Array.isArray(deck.blocks) || deck.blocks.length === 0) fail('deck.blocks is missing or empty');

let cardCount = 0;
for (const block of deck.blocks) {
  if (!block || !Array.isArray(block.q)) fail('a block is missing its q array');
  for (const card of block.q) {
    if (!card || typeof card.q !== 'string' || !card.q.trim()) fail('a card is missing its q text');
    if (typeof card.a !== 'string' || !card.a.trim()) fail('a card is missing its a text');
    cardCount++;
  }
}
if (cardCount === 0) fail('deck has no cards');

const json = JSON.stringify(deck);
const packed = LZString.compressToEncodedURIComponent(json);
console.log(`${PAGE}#d=${packed}`);
