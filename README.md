# Granthia - Claude Code plugin marketplace

This repository is the **Granthia Claude Code plugin marketplace**. It hosts the
`granthiaai-client` plugin: it captures your Claude Code conversation history, syncs it to
the Granthia engine, and adds semantic search over your team's knowledge base through a
remote MCP server.

## Install

```
/plugin marketplace add granthiaai/granthiaai-plugins
/plugin install granthiaai-client@granthiaai
```

Then set the engine endpoint for your region and authorize background sync - see the
plugin's own [README](./plugins/granthiaai-client/README.md) for the one-time setup
(`GRANTHIAAI_MCP_URL`, `~/.granthiaai/config.json`, and `granthiaai login`).

## Updating

Claude Code does **not** auto-update plugins from third-party marketplaces by default, so
you won't silently get new versions. To pick up fixes and new releases, either enable
auto-update for this marketplace (in `/plugin` -> Marketplaces -> Enable auto-update) or
periodically run:

```
/plugin marketplace update granthiaai
```

New versions are then applied on the next Claude Code start (or run `/reload-plugins` to
apply immediately).

## Do not edit this repository directly

It is a **published mirror**, generated from the private `granthiaai-saas` monorepo and
re-synced on each plugin release. Changes made here will be overwritten. Open pull requests
against `granthiaai-saas` instead.
