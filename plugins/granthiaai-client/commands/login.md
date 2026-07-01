---
description: Authorize Granthia background sync. Opens a browser to sign in (add --headless for the device flow on headless/SSH boxes); your finished Claude Code sessions then sync automatically.
disable-model-invocation: true
---

Authorize Granthia background sync. A browser window opens for you to sign in (the
printed URL is the fallback if it does not open), then credentials are saved locally and
your finished sessions sync automatically. On a headless or SSH box, run
`granthiaai login --headless` to use the device-code flow instead.

!`node "${CLAUDE_PLUGIN_ROOT}/bin/granthiaai.js" login`
