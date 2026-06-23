# Granthia - Team Memory & Search for Claude Code

**Granthia is a Claude Code plugin that turns your team's Claude Code conversation
history into a searchable, shared knowledge base.** Ask Claude a question and get answers
grounded in everything your team has already figured out - so nobody solves the same
problem twice.

[Website](https://granthia.ai) · [Pricing](https://granthia.ai/pricing) · [Security](https://granthia.ai/security)

## What Granthia does

- **Search your team's Claude Code history from inside Claude** - semantic and keyword
  search over every captured conversation, served to Claude over a remote MCP server.
- **Automatic background sync** - each finished Claude Code session syncs automatically;
  secrets are redacted on your machine before anything is sent.
- **Private by design** - conversations are processed privately and never sent to a
  third-party model, with per-tenant isolation between teams.

## Install

```
/plugin marketplace add granthiaai/granthiaai-plugins
/plugin install granthiaai-client@granthiaai
```

It works against the hosted service out of the box. See the plugin
[README](./plugins/granthiaai-client/README.md) for one-time login and sync setup.

## How it works

1. **Capture** - the Granthia plugin and CLI sync your Claude Code conversations.
2. **Index** - Granthia makes them searchable with private AI processing.
3. **Search from Claude** - ask questions and get answers from your team's real history.

## Use cases

- **Onboarding** - new engineers ramp on the team's real history, not tribal knowledge.
- **Stop re-solving problems** - the fix a teammate found last quarter is one question away.
- **On-call & incidents** - past incidents and their resolutions, searchable when it counts.

## Updating

Claude Code does **not** auto-update plugins from third-party marketplaces by default. To
get new releases, enable auto-update for this marketplace (in `/plugin` -> Marketplaces) or
run `/plugin marketplace update granthiaai`; updates apply on the next start.

## Learn more

[granthia.ai](https://granthia.ai) - the AI-conversation knowledge base for software teams.
