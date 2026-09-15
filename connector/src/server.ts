import { McpServer } from "@modelcontextprotocol/server";
import { createMcpHandler } from "agents/mcp/server";
import { z } from "zod";
import LZString from "./lz-string.min.js";

const PAGE = "https://alexslkgit.github.io/own-words/deck.html";

const DESCRIPTION_TEXT = `own-words-mcp is a stateless remote MCP server for the own-words study-deck tool.
It exposes one tool, create_deck, which takes a deck JSON object (key, title, blocks[].q[] with q and a
text) and returns a shareable link that packs the whole deck into the URL hash of
${PAGE} — no server-side storage, nothing to log in to.

To add this connector in claude.ai: Settings > Connectors > Add custom connector, paste this
worker's URL with /mcp appended (https://<worker>.workers.dev/mcp), and choose No sign-in.

To add it to Claude Code, put this in your project's .mcp.json:
{ "mcpServers": { "own-words": { "type": "http", "url": "https://<worker>.workers.dev/mcp" } } }`;

interface ValidationOk {
  ok: true;
  cardCount: number;
}

interface ValidationFail {
  ok: false;
  reason: string;
}

function validateDeck(deck: unknown): ValidationOk | ValidationFail {
  if (!deck || typeof deck !== "object") {
    return { ok: false, reason: "deck is not an object" };
  }
  const d = deck as Record<string, unknown>;

  if (typeof d.key !== "string" || !d.key.trim()) {
    return { ok: false, reason: "deck.key is missing or empty" };
  }
  if (typeof d.title !== "string" || !d.title.trim()) {
    return { ok: false, reason: "deck.title is missing or empty" };
  }
  if (!Array.isArray(d.blocks) || d.blocks.length === 0) {
    return { ok: false, reason: "deck.blocks is missing or empty" };
  }

  let cardCount = 0;
  for (const block of d.blocks) {
    if (!block || typeof block !== "object" || !Array.isArray((block as Record<string, unknown>).q)) {
      return { ok: false, reason: "a block is missing its q array" };
    }
    for (const card of (block as Record<string, unknown>).q as unknown[]) {
      if (!card || typeof card !== "object") {
        return { ok: false, reason: "a card is missing its q text" };
      }
      const c = card as Record<string, unknown>;
      if (typeof c.q !== "string" || !c.q.trim()) {
        return { ok: false, reason: "a card is missing its q text" };
      }
      if (typeof c.a !== "string" || !c.a.trim()) {
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

function createServer() {
  const server = new McpServer({
    name: "own-words-mcp",
    version: "1.0.0"
  });

  server.registerTool(
    "create_deck",
    {
      description:
        "Validate a study-deck JSON object and return the shareable own-words link with the card count.",
      inputSchema: { deck: z.record(z.string(), z.unknown()) }
    },
    async ({ deck }) => {
      const result = validateDeck(deck);
      if (!result.ok) {
        return {
          content: [{ type: "text", text: `error: ${result.reason}` }],
          isError: true
        };
      }

      const json = JSON.stringify(deck);
      const packed = LZString.compressToEncodedURIComponent(json);
      const link = `${PAGE}#d=${packed}`;

      return {
        content: [
          {
            type: "text",
            text: `${link}\n${result.cardCount} card${result.cardCount === 1 ? "" : "s"}`
          }
        ]
      };
    }
  );

  return server;
}

const mcpHandler = createMcpHandler(createServer);

export default {
  fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === "/" && request.method === "GET") {
      return new Response(DESCRIPTION_TEXT, {
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }
    return mcpHandler(request, env, ctx);
  }
} satisfies ExportedHandler;
