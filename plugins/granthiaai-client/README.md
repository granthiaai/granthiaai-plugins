# granthiaai-client

The Granthia Claude Code plugin: it captures your Claude Code conversation history,
syncs it to the Granthia engine, and adds semantic search over your team's
knowledge base through a remote MCP server.

## What it does

- **Search** (`search_knowledge`, `search_by_keyword`, `list_projects`): a remote
  MCP server. Claude Code runs its own OAuth on first use - the plugin ships no
  static credentials.
- **Background sync**: a Stop hook runs the bundled `granthiaai` binary after each
  Claude session, syncing the finished session to the engine. Secrets are redacted
  on your machine before anything is sent.

## Install (two commands + two one-time browser flows)

```
/plugin marketplace add granthiaai/granthiaai-plugins
/plugin install granthiaai-client@granthiaai
```

1. On your first search, Claude Code prompts a one-time **MCP OAuth** in the browser.
2. Run **`/granthiaai-client:login`** once to authorize **background sync** (a browser
   window opens to sign in; add `--headless` for the device flow on headless/SSH boxes).
   Until you do, sync is a no-op and reminds you to log in.

Background sync's **engine and issuer URLs default to the hosted service**
(`https://search.granthia.ai` and `https://auth.granthia.ai/realms/granthiaai`),
so the steps above work out of the box against production. Override them in
`~/.granthiaai/config.json` only for local development or self-hosting:

```json
{
  "engine_url": "http://localhost:8787",
  "issuer_url": "http://localhost:8080/realms/granthiaai"
}
```

Or set them in the environment without editing the file (an explicit value in
`config.json` takes precedence if both are present):

```
export GRANTHIAAI_ENGINE_URL="http://localhost:8787"
export GRANTHIAAI_ISSUER_URL="http://localhost:8080/realms/granthiaai"
```

The **MCP server URL** is derived from the same `GRANTHIAAI_ENGINE_URL` that background
sync uses: Claude Code expands `${GRANTHIAAI_ENGINE_URL:-https://search.granthia.ai}/mcp`
in the plugin's `.mcp.json` (only the trailing `/mcp` is fixed). It **defaults to the
hosted service**, so it works out of the box, and a single override points **both** search
and sync at a local engine:

```
export GRANTHIAAI_ENGINE_URL="http://localhost:8787"
```

This must be an environment variable (Claude Code reads it for `.mcp.json`); the
`engine_url` in `config.json` steers background sync only, not search.

## Updating

Third-party marketplaces don't auto-update by default, so run `/plugin marketplace update
granthiaai` periodically (or enable auto-update in `/plugin` -> Marketplaces) to get new
releases; they apply on the next start or via `/reload-plugins`.

## Commands

Run these as slash commands inside Claude Code (they invoke the plugin's bundled binary -
no separate CLI install needed):

- `/granthiaai-client:login` - authorize background sync (a browser window opens to sign
  in; `--headless` uses the device flow; tokens stored at `~/.granthiaai/credentials.json`,
  mode 0600).
- `/granthiaai-client:status` - login state, engine URL, last sync result.
- `/granthiaai-client:logout` - remove cached credentials.
- `/granthiaai-client:sync` - manual full-scan sync (the Stop hook does this automatically,
  targeted at the finished session).

## Notes

- **Reach:** sync runs wherever the Claude Code **CLI** runs, including the VS Code
  and JetBrains integrated terminals. It does not reach the native GUI assistant
  panels (those store sessions separately). Search works in the CLI and the VS Code
  extension.
- **If search doesn't connect right after install**, restart Claude Code. A
  transient first-contact failure can be cached as "needs auth" until restart.
- Sync logs go to `~/.granthiaai/sync.log` (self-maintaining, bounded, bearer
  tokens redacted).
- **Excluded projects:** add Claude projects-directory names to
  `excluded_projects` in `~/.granthiaai/config.json` to skip them.
