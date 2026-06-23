#!/usr/bin/env node

// src/commands/login.ts
import { setTimeout as delay } from "timers/promises";
import { spawn } from "child_process";
import { platform } from "os";

// src/config.ts
import { readFile } from "fs/promises";

// src/paths.ts
import { homedir } from "os";
import { join } from "path";
function granthiaaiDir() {
  return join(homedir(), ".granthiaai");
}
function credentialsPath() {
  return join(granthiaaiDir(), "credentials.json");
}
function configPath() {
  return join(granthiaaiDir(), "config.json");
}
function syncLogPath() {
  return join(granthiaaiDir(), "sync.log");
}
function cursorPath(sessionPath) {
  return sessionPath + ".granthiaai-cursor";
}
function pendingPath(sessionPath) {
  return sessionPath + ".granthiaai-pending";
}
function lockPath(sessionPath) {
  return sessionPath + ".granthiaai-lock";
}
function claudeProjectsDir() {
  return join(homedir(), ".claude", "projects");
}

// src/config.ts
var DEFAULT_LOG = {
  max_bytes: 5 * 1024 * 1024,
  max_rotations: 3,
  retention_days: 7
};
var DEFAULT_CLIENT_ID = "granthiaai-cli";
function withDefaults(raw) {
  return {
    engine_url: raw.engine_url ?? "",
    issuer_url: raw.issuer_url ?? "",
    client_id: raw.client_id ?? DEFAULT_CLIENT_ID,
    excluded_projects: raw.excluded_projects ?? [],
    log: { ...DEFAULT_LOG, ...raw.log ?? {} }
  };
}
async function loadConfig() {
  let raw = {};
  try {
    raw = JSON.parse(await readFile(configPath(), "utf-8"));
  } catch {
  }
  return withDefaults(raw);
}

// src/credentials.ts
import { chmod, mkdir, readFile as readFile2, rm, writeFile } from "fs/promises";
async function readCredentials() {
  try {
    return JSON.parse(await readFile2(credentialsPath(), "utf-8"));
  } catch {
    return null;
  }
}
async function writeCredentials(creds) {
  await mkdir(granthiaaiDir(), { recursive: true });
  await writeFile(credentialsPath(), JSON.stringify(creds, null, 2), { mode: 384 });
  await chmod(credentialsPath(), 384);
}
async function clearCredentials() {
  await rm(credentialsPath(), { force: true });
}

// src/oauth.ts
import { createHash, randomBytes } from "crypto";
function base64url(buf) {
  return buf.toString("base64url");
}
function makePkce(makeVerifier) {
  const verifier = makeVerifier ? makeVerifier() : base64url(randomBytes(32));
  const challenge = base64url(createHash("sha256").update(verifier).digest());
  return { verifier, challenge };
}
async function postForm(fetchFn, url, fields) {
  return fetchFn(url, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(fields).toString()
  });
}
async function discoverEndpoints(issuerUrl, fetchFn) {
  const url = `${issuerUrl.replace(/\/+$/, "")}/.well-known/openid-configuration`;
  const res = await fetchFn(url);
  if (!res.ok) throw new Error(`OIDC discovery failed (${res.status}) at ${url}`);
  const doc = await res.json();
  if (!doc.device_authorization_endpoint || !doc.token_endpoint) {
    throw new Error("OIDC metadata is missing device_authorization_endpoint or token_endpoint");
  }
  return {
    device_authorization_endpoint: doc.device_authorization_endpoint,
    token_endpoint: doc.token_endpoint
  };
}
function toCredentials(token, now) {
  return {
    access_token: token.access_token,
    refresh_token: token.refresh_token,
    expires_at: now + token.expires_in * 1e3
  };
}
async function login(opts, deps) {
  const endpoints = await discoverEndpoints(opts.issuerUrl, deps.fetch);
  const pkce = makePkce(deps.makeVerifier);
  const scope = opts.scope ?? "openid offline_access";
  const startRes = await postForm(deps.fetch, endpoints.device_authorization_endpoint, {
    client_id: opts.clientId,
    scope,
    code_challenge: pkce.challenge,
    code_challenge_method: "S256"
  });
  if (!startRes.ok) {
    throw new Error(`device authorization request failed (${startRes.status})`);
  }
  const auth = await startRes.json();
  const verifyUrl = auth.verification_uri_complete ?? auth.verification_uri;
  deps.log(
    `To authorize Granthia sync, visit:
  ${verifyUrl}
and enter the code: ${auth.user_code}`
  );
  deps.openBrowser?.(verifyUrl);
  let intervalMs = (auth.interval ?? 5) * 1e3;
  const deadline = deps.now() + auth.expires_in * 1e3;
  for (; ; ) {
    if (deps.now() >= deadline) {
      throw new Error("device authorization expired before approval; run `granthiaai login` again");
    }
    await deps.sleep(intervalMs);
    const res = await postForm(deps.fetch, endpoints.token_endpoint, {
      grant_type: "urn:ietf:params:oauth:grant-type:device_code",
      device_code: auth.device_code,
      client_id: opts.clientId,
      code_verifier: pkce.verifier
    });
    if (res.ok) {
      const token = await res.json();
      return toCredentials(token, deps.now());
    }
    const body = await res.json().catch(() => ({}));
    switch (body.error) {
      case "authorization_pending":
        continue;
      case "slow_down":
        intervalMs += 5e3;
        continue;
      case "expired_token":
        throw new Error("device authorization expired before approval; run `granthiaai login` again");
      case "access_denied":
        throw new Error("authorization was denied");
      default:
        throw new Error(`token request failed (${res.status})${body.error ? `: ${body.error}` : ""}`);
    }
  }
}
async function refresh(opts, refreshToken, deps) {
  let endpoints;
  try {
    endpoints = await discoverEndpoints(opts.issuerUrl, deps.fetch);
  } catch (err) {
    return { kind: "outage", message: err.message };
  }
  let res;
  try {
    res = await postForm(deps.fetch, endpoints.token_endpoint, {
      grant_type: "refresh_token",
      client_id: opts.clientId,
      refresh_token: refreshToken
    });
  } catch (err) {
    return { kind: "outage", message: err.message };
  }
  if (res.ok) {
    const token = await res.json();
    return {
      kind: "ok",
      credentials: toCredentials(
        { access_token: token.access_token, refresh_token: token.refresh_token ?? refreshToken, expires_in: token.expires_in },
        deps.now()
      )
    };
  }
  if (res.status >= 400 && res.status < 500) {
    const body = await res.json().catch(() => ({}));
    return { kind: "rejected", message: body.error ?? `refresh rejected (${res.status})` };
  }
  return { kind: "outage", message: `refresh failed (${res.status})` };
}

// src/commands/login.ts
function openBrowser(url) {
  let cmd;
  let args;
  switch (platform()) {
    case "darwin":
      cmd = "open";
      args = [url];
      break;
    case "win32":
      cmd = "rundll32";
      args = ["url.dll,FileProtocolHandler", url];
      break;
    default:
      cmd = "xdg-open";
      args = [url];
  }
  try {
    spawn(cmd, args, { stdio: "ignore", detached: true }).on("error", () => {
    }).unref();
  } catch {
  }
}
function defaultOAuthDeps() {
  return {
    fetch: globalThis.fetch,
    now: () => Date.now(),
    sleep: (ms) => delay(ms),
    log: (msg) => console.log(msg),
    openBrowser
  };
}
async function loginCommand(deps = defaultOAuthDeps()) {
  const config = await loadConfig();
  if (!config.issuer_url) {
    throw new Error(
      "issuer_url is not set. Add it to ~/.granthiaai/config.json (the Keycloak realm URL)."
    );
  }
  const credentials = await login(
    { issuerUrl: config.issuer_url, clientId: config.client_id },
    deps
  );
  await writeCredentials(credentials);
  console.log("Logged in. Background sync is now authorized.");
}

// src/commands/logout.ts
async function logoutCommand() {
  await clearCredentials();
  console.log("Logged out. Background sync is disabled until you log in again.");
}

// src/commands/status.ts
import { readFile as readFile3 } from "fs/promises";

// src/version.ts
var CLIENT_VERSION = true ? "2026.6.3" : "0.0.0-dev";

// src/commands/status.ts
async function lastLogLine() {
  try {
    const lines = (await readFile3(syncLogPath(), "utf-8")).split("\n").filter((l) => l.trim());
    return lines.length ? lines[lines.length - 1] : null;
  } catch {
    return null;
  }
}
async function gatherStatus(now = Date.now()) {
  const config = await loadConfig();
  const creds = await readCredentials();
  return {
    loggedIn: creds !== null,
    accessTokenExpired: creds !== null && creds.expires_at <= now,
    engineUrl: config.engine_url,
    issuerUrl: config.issuer_url,
    version: CLIENT_VERSION,
    lastSync: await lastLogLine()
  };
}
async function statusCommand() {
  const s = await gatherStatus();
  console.log(`Granthia CLI ${s.version}`);
  console.log(`  logged in: ${s.loggedIn ? s.accessTokenExpired ? "yes (access token expired; will refresh)" : "yes" : "no - run `granthiaai login`"}`);
  console.log(`  engine:    ${s.engineUrl || "(not configured)"}`);
  console.log(`  issuer:    ${s.issuerUrl || "(not configured)"}`);
  console.log(`  last sync: ${s.lastSync ?? "(no sync log yet)"}`);
}

// src/sync.ts
import { readdir, readFile as readFile6 } from "fs/promises";
import { basename as basename2, dirname, join as join2 } from "path";

// src/lock.ts
import { open, readFile as readFile4, rm as rm2, stat } from "fs/promises";
var STALE_MS = 10 * 60 * 1e3;
async function isStale(path, now) {
  try {
    const data = JSON.parse(await readFile4(path, "utf-8"));
    if (typeof data.at === "number") return now - data.at > STALE_MS;
  } catch {
  }
  try {
    const s = await stat(path);
    return now - s.mtimeMs > STALE_MS;
  } catch {
    return true;
  }
}
async function acquireLock(sessionPath, now = Date.now()) {
  const path = lockPath(sessionPath);
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const fh = await open(path, "wx");
      try {
        await fh.write(JSON.stringify({ pid: process.pid, at: now }));
      } finally {
        await fh.close();
      }
      return { release: () => rm2(path, { force: true }) };
    } catch (err) {
      if (err.code !== "EEXIST") throw err;
      if (!await isStale(path, now)) return null;
      await rm2(path, { force: true });
    }
  }
  return null;
}

// src/repo-identity.ts
import { execFileSync } from "child_process";
import { hostname } from "os";

// ../shared/dist/redaction.js
var REDACTED = "[REDACTED_SECRET]";
var RULES = [
  {
    name: "pem-private-key",
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA |PGP )?PRIVATE KEY-----/g
  },
  { name: "aws-access-key-id", pattern: /\bAKIA[0-9A-Z]{16}\b/g },
  { name: "github-token", pattern: /\bgh[posru]_[A-Za-z0-9]{36,}\b/g },
  { name: "slack-token", pattern: /\bxox[baprs]-[A-Za-z0-9-]{10,}\b/g },
  { name: "google-api-key", pattern: /\bAIza[0-9A-Za-z_-]{35}\b/g },
  { name: "openai-anthropic-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { name: "stripe-key", pattern: /\b[rs]k_(?:live|test)_[A-Za-z0-9]{16,}\b/g },
  {
    name: "jwt",
    pattern: /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g
  },
  { name: "bearer-token", pattern: /\b[Bb]earer\s+[A-Za-z0-9._-]{20,}/g }
];
function redactSecrets(text) {
  let out = text;
  for (const rule of RULES) {
    out = out.replace(rule.pattern, REDACTED);
  }
  return out;
}

// ../shared/dist/repo-url.js
function canonicalizeRepoUrl(raw) {
  let s = raw.trim();
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const firstSlash = s.indexOf("/");
  const authorityEnd = firstSlash === -1 ? s.length : firstSlash;
  const at = s.lastIndexOf("@", authorityEnd);
  if (at !== -1)
    s = s.slice(at + 1);
  const colon = s.indexOf(":");
  if (colon !== -1 && s.indexOf("/") > colon) {
    const after = s.slice(colon + 1);
    if (!/^\d+(\/|$)/.test(after)) {
      s = s.slice(0, colon) + "/" + after;
    }
  }
  const slash = s.indexOf("/");
  let host = slash === -1 ? s : s.slice(0, slash);
  let path = slash === -1 ? "" : s.slice(slash);
  host = host.replace(/:\d+$/, "");
  host = host.toLowerCase();
  path = path.replace(/\/+$/, "").replace(/\.git$/, "");
  return host + path;
}

// src/repo-identity.ts
var defaultReadRemote = (cwd) => {
  try {
    const out = execFileSync("git", ["-C", cwd, "config", "--get", "remote.origin.url"], {
      encoding: "utf-8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    const trimmed = out.trim();
    return trimmed || null;
  } catch {
    return null;
  }
};
function resolveRepoUrl(input, readRemote = defaultReadRemote) {
  if (!input.cwd) return input.projectDirName;
  const remote = readRemote(input.cwd);
  if (remote) return canonicalizeRepoUrl(remote);
  return input.cwd;
}
function getHostname() {
  return hostname();
}

// src/session-sync.ts
import { readFile as readFile5, writeFile as writeFile2, rm as rm3 } from "fs/promises";
import { basename } from "path";

// src/jsonl-parser.ts
function parseJSONL(raw) {
  const results = [];
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      results.push(JSON.parse(trimmed));
    } catch {
    }
  }
  return results;
}
function renderToolResult(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map(
      (b) => typeof b === "string" ? b : typeof b?.text === "string" ? b.text : ""
    ).filter(Boolean).join("\n");
  }
  return "";
}
function renderContent(content) {
  if (typeof content === "string") {
    return content;
  }
  if (!Array.isArray(content)) return null;
  const parts = [];
  for (const block of content) {
    switch (block.type) {
      case "text":
        if (block.text) parts.push(block.text);
        break;
      case "thinking":
        if (block.thinking) parts.push(block.thinking);
        break;
      case "tool_use":
        parts.push(
          `[tool: ${block.name ?? "unknown"}] ${JSON.stringify(
            block.input ?? {}
          )}`
        );
        break;
      case "tool_result": {
        const rendered = renderToolResult(block.content);
        if (rendered) parts.push(rendered);
        break;
      }
    }
  }
  return parts.length > 0 ? parts.join("\n") : null;
}
function isToolResultLine(content) {
  return Array.isArray(content) && content.some((b) => b.type === "tool_result");
}
function filterConversationTurns(lines) {
  const turns = [];
  for (const line of lines) {
    if (line.type !== "user" && line.type !== "assistant") continue;
    if (line.isMeta) continue;
    if (!line.message?.role || !line.message?.content) continue;
    const content = renderContent(line.message.content);
    if (!content) continue;
    const role = line.message.role === "user" && !isToolResultLine(line.message.content) ? "user" : "assistant";
    turns.push({
      role,
      content,
      timestamp: line.timestamp ?? (/* @__PURE__ */ new Date()).toISOString()
    });
  }
  return turns;
}

// src/chunker.ts
var MIN_ASSISTANT_CONTENT_LENGTH = 30;
var WINDOW_SIZE = 3e3;
var WINDOW_OVERLAP = 200;
var USER_WINDOW_SIZE = 25e4;
function windowText(text, size = WINDOW_SIZE, overlap = WINDOW_OVERLAP) {
  if (text.length <= size) return [text];
  const step = size - overlap;
  const windows = [];
  for (let start = 0; start < text.length; start += step) {
    windows.push(text.slice(start, start + size));
    if (start + size >= text.length) break;
  }
  return windows;
}
function chunkTurns(turns, startIndex = 0) {
  const chunks = [];
  let chunkIndex = startIndex;
  let pendingUser = null;
  let assistantParts = [];
  let assistantTimestamp = "";
  function flush() {
    if (pendingUser === null) return;
    const assistant = assistantParts.join("\n");
    if (assistant.trim().length >= MIN_ASSISTANT_CONTENT_LENGTH) {
      for (const userWindow of windowText(pendingUser, USER_WINDOW_SIZE)) {
        for (const window of windowText(assistant)) {
          chunks.push({
            turn_index: chunkIndex,
            user_content: userWindow,
            assistant_content: window,
            timestamp: assistantTimestamp
          });
          chunkIndex++;
        }
      }
    }
    assistantParts = [];
    assistantTimestamp = "";
  }
  for (const turn of turns) {
    if (turn.role === "user") {
      flush();
      pendingUser = turn.content;
    } else if (pendingUser !== null) {
      assistantParts.push(turn.content);
      assistantTimestamp = turn.timestamp;
    }
  }
  flush();
  return chunks;
}

// src/ingest-client.ts
var BATCH_CHAR_LIMIT = 8 * 1024 * 1024;
var REQUEST_TIMEOUT_MS = 12e4;
function buildBatches(chunks) {
  const batches = [];
  let current = [];
  let size = 0;
  for (const c of chunks) {
    const cost = c.user_content.length + c.assistant_content.length;
    if (current.length > 0 && size + cost > BATCH_CHAR_LIMIT) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(c);
    size += cost;
  }
  if (current.length > 0) batches.push(current);
  return batches;
}
async function postBatch(engineUrl, accessToken, meta, chunks, deps) {
  const url = `${engineUrl.replace(/\/+$/, "")}/ingest`;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), deps.timeoutMs ?? REQUEST_TIMEOUT_MS);
  let res;
  try {
    res = await deps.fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${accessToken}`
      },
      body: JSON.stringify({ ...meta, chunks }),
      signal: controller.signal
    });
  } catch (err) {
    return { kind: "outage", message: err.message };
  } finally {
    clearTimeout(timer);
  }
  if (res.ok) {
    const body = await res.json();
    return { kind: "ok", synced: body.synced, minVersion: body.min_version, reason: body.reason };
  }
  if (res.status === 401) return { kind: "unauthorized" };
  if (res.status === 403) return { kind: "no_tenant" };
  if (res.status >= 500) return { kind: "outage", message: `engine error (${res.status})` };
  return { kind: "error", status: res.status, message: `ingest failed (${res.status})` };
}
async function postIngest(engineUrl, accessToken, meta, chunks, deps = { fetch: globalThis.fetch }) {
  let synced = 0;
  let minVersion;
  let reason;
  for (const batch of buildBatches(chunks)) {
    const outcome = await postBatch(engineUrl, accessToken, meta, batch, deps);
    if (outcome.kind !== "ok") return outcome;
    synced += outcome.synced;
    minVersion = outcome.minVersion ?? minVersion;
    reason = outcome.reason ?? reason;
  }
  return { kind: "ok", synced, minVersion, reason };
}

// src/session-sync.ts
async function getWatermark(path) {
  try {
    const raw = await readFile5(path, "utf-8");
    const parts = raw.trim().split(":");
    return { line: parseInt(parts[0] ?? "", 10) || 0, nextTurnIndex: parseInt(parts[1] ?? "", 10) || 0 };
  } catch {
    return { line: 0, nextTurnIndex: 0 };
  }
}
async function readLinesOrNull(path) {
  try {
    return (await readFile5(path, "utf-8")).split("\n");
  } catch {
    return null;
  }
}
function weight(lines) {
  let total = 0;
  for (const l of lines) total += l.trim().length;
  return total;
}
function redactChunks(chunks) {
  return chunks.map((c) => ({
    ...c,
    user_content: redactSecrets(c.user_content),
    assistant_content: redactSecrets(c.assistant_content)
  }));
}
async function syncSession(params) {
  const { sessionPath, repoUrl, hostname: hostname2, engineUrl, auth, deps } = params;
  let credentials = params.credentials;
  const sessionId = basename(sessionPath, ".jsonl");
  const cursor = cursorPath(sessionPath);
  const pending = pendingPath(sessionPath);
  const { line: watermark, nextTurnIndex } = await getWatermark(cursor);
  const sourceLines = await readLinesOrNull(sessionPath) ?? [];
  const sourceLen = sourceLines.length;
  const sourceDelta = watermark < sourceLen ? sourceLines.slice(watermark) : [];
  const pendingLines = await readLinesOrNull(pending);
  const delta = pendingLines && weight(sourceDelta) < weight(pendingLines) ? pendingLines : sourceDelta;
  if (weight(delta) === 0) {
    if (pendingLines) await rm3(pending, { force: true });
    if (sourceLen !== watermark) await writeFile2(cursor, `${sourceLen}:${nextTurnIndex}`);
    return { result: { kind: "nothing" }, credentials };
  }
  const turns = filterConversationTurns(parseJSONL(delta.join("\n")));
  const chunks = chunkTurns(turns, nextTurnIndex);
  if (chunks.length === 0) {
    if (pendingLines) await rm3(pending, { force: true });
    await writeFile2(cursor, `${sourceLen}:${nextTurnIndex}`);
    return { result: { kind: "nothing" }, credentials };
  }
  await writeFile2(pending, delta.map(redactSecrets).join("\n"));
  const meta = { repo_url: repoUrl, hostname: hostname2, session_id: sessionId };
  const redacted = redactChunks(chunks);
  const send = (accessToken) => postIngest(engineUrl, accessToken, meta, redacted, { fetch: deps.fetch, timeoutMs: deps.timeoutMs });
  let outcome = await send(credentials.access_token);
  if (outcome.kind === "unauthorized") {
    const refreshed = await refresh(auth, credentials.refresh_token, { fetch: deps.fetch, now: deps.now });
    if (refreshed.kind === "outage") {
      return { result: { kind: "outage", message: refreshed.message }, credentials };
    }
    if (refreshed.kind === "rejected") {
      return { result: { kind: "needs_login" }, credentials };
    }
    credentials = refreshed.credentials;
    outcome = await send(credentials.access_token);
  }
  switch (outcome.kind) {
    case "ok":
      if (outcome.reason) {
        return { result: { kind: "capped", reason: outcome.reason }, credentials };
      }
      await rm3(pending, { force: true });
      await writeFile2(cursor, `${sourceLen}:${nextTurnIndex + chunks.length}`);
      return {
        result: { kind: "synced", synced: outcome.synced, minVersion: outcome.minVersion },
        credentials
      };
    case "no_tenant":
      return { result: { kind: "no_tenant" }, credentials };
    case "unauthorized":
      return { result: { kind: "outage", message: "still unauthorized after refresh" }, credentials };
    case "outage":
    case "error":
      return { result: { kind: "outage", message: outcome.message }, credentials };
  }
}

// src/log.ts
import { appendFile, mkdir as mkdir2, rename, rm as rm4, stat as stat2 } from "fs/promises";
var BEARER = /\b[Bb]earer\s+[A-Za-z0-9._-]+/g;
async function fileSize(path) {
  try {
    return (await stat2(path)).size;
  } catch {
    return 0;
  }
}
async function safeRename(from, to) {
  try {
    await rename(from, to);
  } catch {
  }
}
async function maintainLog(cfg, now = Date.now()) {
  await mkdir2(granthiaaiDir(), { recursive: true });
  const base = syncLogPath();
  if (await fileSize(base) > cfg.max_bytes) {
    await rm4(`${base}.${cfg.max_rotations}`, { force: true });
    for (let i = cfg.max_rotations - 1; i >= 1; i--) {
      await safeRename(`${base}.${i}`, `${base}.${i + 1}`);
    }
    await safeRename(base, `${base}.1`);
  }
  const cutoff = now - cfg.retention_days * 24 * 60 * 60 * 1e3;
  for (let i = 1; i <= cfg.max_rotations; i++) {
    const p = `${base}.${i}`;
    try {
      if ((await stat2(p)).mtimeMs < cutoff) await rm4(p, { force: true });
    } catch {
    }
  }
}
async function appendLog(line) {
  await mkdir2(granthiaaiDir(), { recursive: true });
  const safe = line.replace(BEARER, "Bearer [REDACTED]");
  await appendFile(syncLogPath(), safe.endsWith("\n") ? safe : `${safe}
`);
}

// src/sync.ts
function defaultDeps() {
  return { fetch: globalThis.fetch, now: () => Date.now() };
}
function compareVersions(a, b) {
  const pa = a.split(".").map((n) => parseInt(n, 10) || 0);
  const pb = b.split(".").map((n) => parseInt(n, 10) || 0);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i] ?? 0;
    const y = pb[i] ?? 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}
async function cwdFromSession(sessionPath) {
  try {
    const raw = await readFile6(sessionPath, "utf-8");
    for (const line of raw.split("\n")) {
      const t = line.trim();
      if (!t) continue;
      try {
        const obj = JSON.parse(t);
        if (typeof obj.cwd === "string" && obj.cwd) return obj.cwd;
      } catch {
      }
    }
  } catch {
  }
  return null;
}
async function fullScanTargets(excluded) {
  const root = claudeProjectsDir();
  let dirs;
  try {
    dirs = await readdir(root);
  } catch {
    return [];
  }
  const exclude = new Set(excluded);
  const targets = [];
  for (const dir of dirs) {
    if (exclude.has(dir)) continue;
    const projectDir = join2(root, dir);
    let files;
    try {
      files = await readdir(projectDir);
    } catch {
      continue;
    }
    for (const f of files) {
      if (!f.endsWith(".jsonl")) continue;
      const sessionPath = join2(projectDir, f);
      targets.push({ sessionPath, cwd: await cwdFromSession(sessionPath), projectDirName: dir });
    }
  }
  return targets;
}
async function runSync(payload, deps = defaultDeps()) {
  const config = await loadConfig();
  await maintainLog(config.log, deps.now());
  const creds = await readCredentials();
  if (!creds) {
    await appendLog("Not logged in. Run `/granthiaai-client:login` in Claude Code to authorize background sync.");
    return;
  }
  if (!config.engine_url || !config.issuer_url) {
    await appendLog("engine_url / issuer_url are not configured in ~/.granthiaai/config.json.");
    return;
  }
  const targets = payload?.transcript_path ? [
    {
      sessionPath: payload.transcript_path,
      cwd: payload.cwd ?? null,
      projectDirName: basename2(dirname(payload.transcript_path))
    }
  ] : await fullScanTargets(config.excluded_projects);
  const sessionDeps = { fetch: deps.fetch, now: deps.now, timeoutMs: deps.timeoutMs };
  let credentials = creds;
  let minVersion;
  let sawNeedsLogin = false;
  let sawNoTenant = false;
  let cappedReason;
  for (const t of targets) {
    const lock = await acquireLock(t.sessionPath, deps.now());
    if (!lock) continue;
    try {
      const repoUrl = resolveRepoUrl({ cwd: t.cwd, projectDirName: t.projectDirName });
      const out = await syncSession({
        sessionPath: t.sessionPath,
        repoUrl,
        hostname: getHostname(),
        engineUrl: config.engine_url,
        auth: { issuerUrl: config.issuer_url, clientId: config.client_id },
        credentials,
        deps: sessionDeps
      });
      if (out.credentials !== credentials) {
        credentials = out.credentials;
        await writeCredentials(credentials);
      }
      const r = out.result;
      switch (r.kind) {
        case "synced":
          await appendLog(`[${basename2(t.sessionPath)}] synced ${r.synced} chunk(s).`);
          if (r.minVersion) minVersion = r.minVersion;
          break;
        case "no_tenant":
          sawNoTenant = true;
          break;
        case "capped":
          cappedReason = r.reason;
          break;
        case "needs_login":
          sawNeedsLogin = true;
          break;
        case "outage":
          await appendLog(`[${basename2(t.sessionPath)}] sync deferred (kept buffer): ${r.message}`);
          break;
        case "nothing":
          break;
      }
    } finally {
      await lock.release();
    }
    if (sawNeedsLogin) break;
  }
  if (minVersion && compareVersions(CLIENT_VERSION, minVersion) < 0) {
    await appendLog(
      `A newer Granthia client is required (have ${CLIENT_VERSION}, need ${minVersion}). Update the plugin via /plugin.`
    );
  }
  if (sawNoTenant) {
    await appendLog("No active tenant yet - data is buffered and will sync once onboarding completes.");
  }
  if (cappedReason === "storage_cap") {
    await appendLog("Storage limit reached - data is buffered and will sync once you free space or upgrade your plan.");
  } else if (cappedReason === "suspended") {
    await appendLog("Workspace suspended - data is buffered and will sync once the workspace is reactivated.");
  }
  if (sawNeedsLogin) {
    await appendLog("Session expired. Run `/granthiaai-client:login` in Claude Code again to resume background sync.");
  }
}

// src/index.ts
var USAGE = `Granthia CLI

Usage:
  granthiaai login    Authorize background sync (device-flow OAuth)
  granthiaai logout   Remove cached credentials
  granthiaai status   Show login state, engine URL, and last sync
  granthiaai sync     Sync sessions (Stop hook = targeted; manual = full scan)`;
async function readHookPayload() {
  if (process.stdin.isTTY) return null;
  const chunks = [];
  for await (const chunk of process.stdin) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf-8").trim();
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function main() {
  const command = process.argv[2];
  switch (command) {
    case "login":
      await loginCommand();
      return;
    case "logout":
      await logoutCommand();
      return;
    case "status":
      await statusCommand();
      return;
    case "sync": {
      try {
        await runSync(await readHookPayload());
      } catch (err) {
        await appendLog(`sync error: ${err.message}`);
      }
      return;
    }
    default:
      console.log(USAGE);
      return;
  }
}
main().catch((err) => {
  console.error(err.message);
  process.exitCode = 1;
});
