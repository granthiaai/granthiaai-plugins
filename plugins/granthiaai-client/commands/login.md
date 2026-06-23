---
description: Authorize Granthia background sync (one-time device-flow OAuth). Opens a browser window to approve; your finished Claude Code sessions then sync automatically.
disable-model-invocation: true
---

Authorize Granthia background sync. This runs a one-time device-flow login: a browser
window opens for you to approve (the printed URL is the fallback if it does not), then
credentials are saved locally and your finished sessions sync automatically.

!`node "${CLAUDE_PLUGIN_ROOT}/bin/granthiaai.js" login`
