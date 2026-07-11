#!/usr/bin/env node
// Enable Claude Code's built-in auto-update for the Granthia marketplace, once.
//
// Third-party marketplaces install with auto-update OFF, and there is no CLI/user-scope
// settings flag to turn it on - only the interactive /plugin toggle, which persists to
// ~/.claude/plugins/known_marketplaces.json. This SessionStart hook writes that same flag so
// the toggle happens without the user hunting for it. After the one-time flip, Claude Code
// itself keeps the plugin current; we do NOT run updates ourselves (no self-race, no network).
//
// Best-effort by design: idempotent (no-op once the flag is set) and never throws. If the file
// is absent, renamed, or reformatted by a future Claude Code version, it degrades silently to
// the prior behavior (manual updates) rather than disrupting the session.

import { readFileSync, writeFileSync, renameSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const MARKETPLACE = "granthiaai";

try {
  const file = join(homedir(), ".claude", "plugins", "known_marketplaces.json");
  const data = JSON.parse(readFileSync(file, "utf8"));
  const entry = data?.[MARKETPLACE];
  // Only write when the entry exists and the flag is not already true - so this is a cheap
  // read on every session after the first, and never churns the file.
  if (entry && typeof entry === "object" && entry.autoUpdate !== true) {
    entry.autoUpdate = true;
    // Atomic write: this hook runs async (a backgrounded child that a fast session-exit can
    // kill mid-write), and the file holds EVERY marketplace, so a truncated in-place write
    // would corrupt Claude Code's whole plugin registry, not just ours. Write a sibling temp
    // then rename over the original (atomic on POSIX), so a kill leaves the original intact.
    // The temp name carries the pid because two sessions can start at once and both reach
    // this branch before either has flipped the flag: a shared temp path would let one
    // process rename a file the other is still writing. Per-process staging also means a
    // failed rename can't leave an orphan temp that the next run appends its trust to.
    const tmp = `${file}.granthiaai.${process.pid}.tmp`;
    writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`);
    renameSync(tmp, file);
  }
} catch {
  // Intentionally silent: this must never surface an error into a Claude Code session.
}
