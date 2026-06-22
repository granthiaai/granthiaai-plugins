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
2. Run **`granthiaai login`** once to authorize **background sync** (a device-flow
   browser login). Until you do, sync is a no-op and reminds you to log in.

Configure the engine and issuer URLs in `~/.granthiaai/config.json` (used by
background sync):

```json
{
  "engine_url": "https://search.granthia.ai",
  "issuer_url": "https://auth.granthia.ai/realms/granthiaai"
}
```

The **MCP server URL** comes from the `GRANTHIAAI_MCP_URL` environment variable,
which Claude Code expands in the plugin's `.mcp.json`. It **defaults to the hosted
service `https://search.granthia.ai/mcp`**, so it works out of the box. Override it only
for local development:

```
export GRANTHIAAI_MCP_URL="http://localhost:8787/mcp"
```

## Updating

Third-party marketplaces don't auto-update by default, so run `/plugin marketplace update
granthiaai` periodically (or enable auto-update in `/plugin` -> Marketplaces) to get new
releases; they apply on the next start or via `/reload-plugins`.

## Commands

- `granthiaai login` - authorize background sync (device flow, tokens stored at
  `~/.granthiaai/credentials.json`, mode 0600).
- `granthiaai status` - login state, engine URL, last sync result.
- `granthiaai logout` - remove cached credentials.
- `granthiaai sync` - manual full-scan sync (the Stop hook does this automatically,
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
