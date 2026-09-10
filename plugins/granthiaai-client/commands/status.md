---
description: Show Granthia client status - the account you sync as, the account you search as, login state, engine URL, and last sync result.
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_DATA}/runtime/node:*), mcp__plugin_granthiaai-client_granthiaai__whoami
---

Granthia client status (account, login state, engine URL, last sync):

!`"${CLAUDE_PLUGIN_DATA}/runtime/node" "${CLAUDE_PLUGIN_ROOT}/bin/granthiaai.js" status`

Print the command output above VERBATIM inside a code block - every line, in order, with no
rewording, no summarising, no omissions and nothing added, and no explanation INSIDE the block: a
value that has been reworded cannot be told from one the command printed.

Then call the `whoami` MCP tool and print its answer as a single line immediately BELOW the code
block, in exactly this form:

    search as: <account> (MCP)

If the tool call fails, print exactly:

    search as: (unavailable - expected before onboarding completes; otherwise restart Claude Code, then authorise with /mcp)

Never guess that value, and never copy the `account:` value from the block into it: if the two
identities have silently diverged, the guess hides the exact problem this line exists to reveal.

Write nothing after that line - unless the block reports a FAILURE, which is the one case that
needs saying. THREE things count, not one: the command did not run at all; its `last sync:` line
reports something that is stopping capture NOW; or its `pending:` line reports conversations
`set aside`. That third one matters because it is the ONLY signal for a client that is
permanently stuck - a sign-in refused for good reads as an ordinary `last sync:` line promising a
retry that will never succeed, and the set-aside count growing run after run is what gives it
away. Then explain it below the `search as:` line, in a sentence or two. A status reporting normal
state needs no commentary and gets none.

A `last sync:` entry ending `(superseded by the current sign-in)` is NOT one of those. The entry is
a record of a refusal that has already been resolved - the `logged in:` line above it says so - and
explaining it would tell the reader to fix something they have just fixed, which is the whole thing
that marker exists to prevent.
