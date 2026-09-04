---
description: Show Granthia client status - the account you sync as, the account you search as, login state, engine URL, and last sync result.
disable-model-invocation: true
allowed-tools: Bash(${CLAUDE_PLUGIN_DATA}/runtime/node:*), mcp__plugin_granthiaai-client_granthiaai__whoami
---

Granthia client status (account, login state, engine URL, last sync):

!`"${CLAUDE_PLUGIN_DATA}/runtime/node" "${CLAUDE_PLUGIN_ROOT}/bin/granthiaai.js" status`

Present the command output above VERBATIM, inside a code block, exactly as printed -
every line, in order, with no rewording, no summarising, no omissions and nothing added.

This output is read to answer factual questions - which account am I syncing as, which
deployment am I pointed at, how much is undelivered - and a paraphrase of it is worthless
for that: a reader cannot tell a reworded value from a real one. If something in it needs
explaining, say so AFTER the block, never by editing what is inside it.

Then call the `whoami` MCP tool and print its answer as a single line immediately BELOW
the code block, in this exact form:

    search as: <account> (MCP)

The CLI cannot answer this one. Sync is authorised by the CLI's own stored token, while
searches go over the MCP connection that Claude Code authorised separately, and the two can
be different accounts - which is what the `note:` line inside the block warns about. Only the
server knows the second identity, so this line is the sole place it can be read.

If the tool call fails, print `search as: (unavailable - expected before onboarding completes;
otherwise restart Claude Code, then authorise with /mcp)` instead.

That line names three states rather than asserting one, because the call fails in all of them
and they are not distinguishable from here:

- **Onboarding is not finished.** The service answers nothing until the account has a
  workspace, so this is expected and needs no action - search does not work yet either.
- **The session predates the capability.** Claude Code caches a server's tool list for the life
  of the session, so a session that started before `whoami` shipped reports no such tool while
  search itself works perfectly. A restart fixes it.
- **The connection is genuinely unauthorised.** `/mcp` covers that one.

None of the remedies is `/granthiaai-client:login`: that authorises background sync, and this
connection is Claude Code's own, so signing the client in again would change nothing here.

Do not guess the value, and never copy the `account:` value from the block into this line: if
those two accounts have silently diverged, that guess would hide the exact problem this line
exists to reveal.
