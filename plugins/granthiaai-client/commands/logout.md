---
description: Remove cached Granthia credentials. Background sync stops until you log in again.
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_DATA}/runtime/node:*)
---

Remove cached Granthia credentials (background sync stops until you log in again):

!`"${CLAUDE_PLUGIN_DATA}/runtime/node" "${CLAUDE_PLUGIN_ROOT}/bin/granthiaai.js" logout`
