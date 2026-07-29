---
description: Show Granthia client status - the account you sync as, login state, engine URL, and last sync result.
disable-model-invocation: true
allowed-tools: Bash(node:*)
---

Granthia client status (account, login state, engine URL, last sync):

!`node "${CLAUDE_PLUGIN_ROOT}/bin/granthiaai.js" status`

Present the command output above VERBATIM, inside a code block, exactly as printed -
every line, in order, with no rewording, no summarising, no omissions and nothing added.

This output is read to answer factual questions - which account am I syncing as, which
deployment am I pointed at, how much is undelivered - and a paraphrase of it is worthless
for that: a reader cannot tell a reworded value from a real one. If something in it needs
explaining, say so AFTER the block, never by editing what is inside it.
