# own-words-mcp

A stateless remote MCP server, deployed as a Cloudflare Worker, that wraps the own-words
study-deck tool. It exposes one tool, `create_deck`, which validates a deck JSON object
and returns the shareable link (`deck.html#d=<packed>`) plus the card count. There is no
storage: the whole deck lives in the URL hash, packed with lz-string.

## Run it

```bash
npm install
npx wrangler dev --port 8787   # local, no login needed
npx wrangler deploy            # requires `wrangler login` once
```

## Add it to claude.ai

Settings > Connectors > Add custom connector, paste the deployed URL with `/mcp`
appended (`https://<worker>.workers.dev/mcp`), and pick No sign-in.

## Add it to Claude Code

Add to the project's `.mcp.json`:

```json
{ "mcpServers": { "own-words": { "type": "http", "url": "https://<worker>.workers.dev/mcp" } } }
```

## Tests

```bash
npm test
```

MIT.
