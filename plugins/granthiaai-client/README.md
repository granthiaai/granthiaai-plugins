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
   Until you do, sync is a no-op and reminds you to log in. Claude Code will ask you to
   approve the command the first time - that is expected; see
   [approval](#this-command-requires-approval-when-running-a-command) to stop being asked.

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

### Data residency: how search and sync find your region

Your data is stored in the region you chose at signup, and the client talks to that region
directly. **You do not configure this** - signing in asks the Granthia control
plane where your data lives and points the client at it:

- **Background sync (ingest)** reads the endpoint from `~/.granthiaai/config.json`. It is
  regional the moment you log in.
- **Search (the MCP server)** is connected by Claude Code, not by us. Claude Code expands
  `${GRANTHIAAI_ENGINE_URL}` in this plugin's `.mcp.json` from its **environment**, at
  **startup** - it never reads `config.json`. So login also writes that variable into
  `~/.claude/settings.json`'s `env` block (merging: your other settings are untouched).

Because Claude Code reads that block at startup, **restart Claude Code after your first
login** so search uses your region. Login tells you when this is needed. Until you restart,
a search sent to the wrong region is **refused**, never answered with the wrong data.

If your tenant is ever migrated to another region, background sync notices (the old region
starts refusing it), re-resolves against the control plane, and updates both endpoints
automatically. You will be asked to restart Claude Code once more.

### Overriding the endpoint (dev / self-host)

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

### "This command requires approval" when running a command

Each of these commands runs the plugin's bundled binary through Node, and Claude Code asks
before running any shell command it has not been told to trust. **Approve it and the command
runs normally** - that is the expected first-run experience, not a fault.

Approving is also the safest answer, and you will rarely be asked: `login` is a one-time
step, and background sync never goes through these commands at all - the Stop hook invokes
the binary directly.

If you would rather not be asked, allow it in your own settings (`~/.claude/settings.json`
for every project, or `.claude/settings.json` for one):

```json
{
  "permissions": {
    "allow": ["Bash(node:*)"]
  }
}
```

**Understand what that grants before you paste it:** it trusts *any* command starting with
`node` in that scope from then on, including `node -e "<code>"`. It is not scoped to this
plugin.

A narrower rule that still survives plugin updates - Claude Code matches `*` at any position,
so the version in the path does not have to be spelled out:

```json
{
  "permissions": {
    "allow": ["Bash(node *granthiaai-client/*/bin/granthiaai.js*)"]
  }
}
```

Treat that as narrower, not as a security boundary: Claude Code's own documentation warns
that Bash rules constraining arguments are fragile.

The commands also declare `allowed-tools: Bash(node:*)` themselves, which is the documented
way for a command to pre-authorize its own shell call. If you are prompted anyway, the
settings entry above is the reliable route.

To skip Claude Code entirely, run the binary in a terminal - the path is the one named in
the approval prompt:

```
node ~/.claude/plugins/cache/granthiaai/granthiaai-client/<version>/bin/granthiaai.js login
```

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
