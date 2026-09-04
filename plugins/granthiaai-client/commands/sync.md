---
description: Manually sync Claude Code sessions to Granthia now (a full scan). The Stop hook already syncs each finished session automatically.
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_DATA}/runtime/node:*)
---

Manually sync your Claude Code sessions to Granthia now (a full scan; the Stop hook
already syncs each finished session automatically):

!`"${CLAUDE_PLUGIN_DATA}/runtime/node" "${CLAUDE_PLUGIN_ROOT}/bin/granthiaai.js" sync`
