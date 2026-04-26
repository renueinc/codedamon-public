#!/usr/bin/env node
// codedamon (コードだもん) server
// A local HTTP server that serves the Zundamon Avatar Chat UI,
// spawns claude CLI for chat, and proxies TTS requests.

import { createServer } from "node:http";
import { spawn, execSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import { join, extname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

// ---------------------------------------------------------------------------
// CLI args
// ---------------------------------------------------------------------------
const { values: args } = parseArgs({
  options: {
    port:   { type: "string", default: "3456" },
    public: { type: "string" },
    config: { type: "string" },
  },
  strict: false,
});

const PORT = parseInt(args.port, 10) || 3456;
const __filename = fileURLToPath(import.meta.url);
const __dirname  = join(__filename, "..");
const PUBLIC_DIR = args.public ? resolve(args.public) : join(__dirname, "..", "public");
const CONFIG_PATH = args.config ? resolve(args.config) : join(__dirname, "..", "config", "settings.yaml");

// ---------------------------------------------------------------------------
// .env loader (no dependencies)
// ---------------------------------------------------------------------------
function loadEnv() {
  const envPaths = [
    join(resolve(fileURLToPath(import.meta.url), "../.."), ".env"),
    join(resolve(fileURLToPath(import.meta.url), "../.."), ".env.local"),
  ];
  for (const p of envPaths) {
    if (!existsSync(p)) continue;
    for (const line of readFileSync(p, "utf8").split("\n")) {
      const m = line.match(/^\s*([\w]+)\s*=\s*"?([^"#]*)"?\s*$/);
      if (m && !process.env[m[1]]) process.env[m[1]] = m[2].trim();
    }
  }
}
loadEnv();

// ---------------------------------------------------------------------------
// Config loader (simple YAML key: value parser — no dependencies)
// ---------------------------------------------------------------------------
function loadConfig() {
  const cfg = {
    port: PORT,
    cwd: process.cwd(),
    tts_provider: "none",
    fish_audio_key: "",
    fish_audio_model: "",
    cloud_api_key: "",
    voicevox_url: "http://localhost:50021",
    voicevox_speaker: 3,
    voicevox_api_key: "",
  };

  if (!existsSync(CONFIG_PATH)) return cfg;

  const lines = readFileSync(CONFIG_PATH, "utf8").split("\n");
  let inTts = false;
  for (const raw of lines) {
    const line = raw.replace(/#.*$/, "").trimEnd();
    if (!line.trim()) continue;

    if (/^tts:/.test(line)) { inTts = true; continue; }
    if (/^\S/.test(line)) { inTts = false; }

    const m = line.match(/^\s*([\w_]+)\s*:\s*"?([^"]*)"?\s*$/);
    if (!m) continue;
    const [, key, val] = m;

    if (!inTts) {
      if (key === "port") cfg.port = parseInt(val, 10) || PORT;
      if (key === "cwd") cfg.cwd = val;
    } else {
      if (key === "provider") cfg.tts_provider = val;
      if (key === "fish_audio_key") cfg.fish_audio_key = val;
      if (key === "fish_audio_model") cfg.fish_audio_model = val;
      if (key === "api_key") cfg.cloud_api_key = val;
      if (key === "voicevox_url") cfg.voicevox_url = val;
      if (key === "voicevox_speaker") cfg.voicevox_speaker = parseInt(val, 10) || 3;
      if (key === "voicevox_api_key") cfg.voicevox_api_key = val;
    }
  }
  // Environment variables override yaml config
  if (process.env.TTS_PROVIDER) cfg.tts_provider = process.env.TTS_PROVIDER;
  if (process.env.VOICEVOX_URL) cfg.voicevox_url = process.env.VOICEVOX_URL;
  if (process.env.VOICEVOX_SPEAKER) cfg.voicevox_speaker = parseInt(process.env.VOICEVOX_SPEAKER, 10) || 3;
  if (process.env.VOICEVOX_API_KEY) cfg.voicevox_api_key = process.env.VOICEVOX_API_KEY;
  if (process.env.FISH_AUDIO_KEY) cfg.fish_audio_key = process.env.FISH_AUDIO_KEY;
  if (process.env.FISH_AUDIO_MODEL) cfg.fish_audio_model = process.env.FISH_AUDIO_MODEL;

  return cfg;
}

const config = loadConfig();

// ---------------------------------------------------------------------------
// MIME types
// ---------------------------------------------------------------------------
const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".json": "application/json",
  ".jpg":  "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png":  "image/png",
  ".svg":  "image/svg+xml",
  ".ico":  "image/x-icon",
};

// ---------------------------------------------------------------------------
// Path sanitizer — validates that a path is an existing file whose name
// matches an expected pattern, preventing arbitrary paths from reaching spawn.
// ---------------------------------------------------------------------------
// Anchored character-class allowlist for filesystem paths. Rejects any shell
// metacharacter (space, ;, |, &, $, <, >, quotes, etc.) so CodeQL recognizes
// this as a sanitizer on paths flowing into spawn().
const SAFE_PATH_CHARS = /^[A-Za-z0-9_\-./\\:]+$/;

function sanitizeBinaryPath(p, pattern) {
  if (!p || typeof p !== "string") throw new Error("Invalid binary path");
  if (!SAFE_PATH_CHARS.test(p)) throw new Error(`Unsafe characters in binary path: ${p}`);
  const normalized = resolve(p);
  if (!SAFE_PATH_CHARS.test(normalized)) {
    throw new Error(`Unsafe characters in resolved binary path: ${normalized}`);
  }
  if (!existsSync(normalized)) throw new Error(`Binary not found: ${normalized}`);
  if (!pattern.test(normalized)) throw new Error(`Unexpected binary path: ${normalized}`);
  return normalized;
}

// ---------------------------------------------------------------------------
// Session ID sanitizer — validates that a session ID contains only safe
// characters before it is passed as a CLI argument to spawn().
// ---------------------------------------------------------------------------
function sanitizeSessionId(id) {
  if (typeof id !== "string" || !/^[a-zA-Z0-9_-]{1,128}$/.test(id)) {
    throw new Error("Invalid session ID format");
  }
  return id;
}

// ---------------------------------------------------------------------------
// Windows spawn helper
// ---------------------------------------------------------------------------
// On Windows, .cmd files cannot be spawned by Node directly. Rather than
// using "cmd /c" (which passes args through a shell and introduces injection
// risk), we parse the .cmd file to extract the actual node executable and
// script path, then spawn node directly with no shell involved.
function resolveWindowsSpawn(claudePath, args) {
  if (process.platform !== "win32") return [claudePath, args];
  try {
    const cmdContent = readFileSync(claudePath, "utf8");
    // npm .cmd files contain a line like:
    //   "%~dp0\node.exe" "%~dp0\..\@anthropic-ai\claude-code\cli.js" %*
    // or:
    //   node  "%~dp0\..\@anthropic-ai\claude-code\cli.js" %*
    const match = cmdContent.match(/["']?([^"'\r\n]*node(?:\.exe)?)["']?\s+["']([^"'\r\n]+\.js)["']/i);
    if (match) {
      const rawNode = match[1].replace(/%~dp0/gi, join(claudePath, "..") + "\\");
      const rawScript = match[2].replace(/%~dp0/gi, join(claudePath, "..") + "\\");
      // Validate both paths before passing to spawn
      const nodeExe = sanitizeBinaryPath(rawNode, /node(?:\.exe)?$/i);
      const scriptPath = sanitizeBinaryPath(rawScript, /\.js$/i);
      return [nodeExe, [scriptPath, ...args]];
    }
  } catch (err) {
    console.warn("[spawn] resolveWindowsSpawn fallback:", err.message);
  }
  // Fallback: use cmd /c (less safe, but functional)
  return ["cmd", ["/c", claudePath, ...args]];
}

// ---------------------------------------------------------------------------
// claude CLI resolver
// ---------------------------------------------------------------------------
function resolveClaudePath() {
  const found = findClaudePath();
  // Validate the resolved path is an existing file whose name is "claude" (any extension).
  // This sanitization step ensures the value is safe before it reaches spawn().
  return sanitizeBinaryPath(found, /[/\\]claude(?:\.[a-z]+)?$/i);
}

function findClaudePath() {
  // 1. Check CLAUDE_PATH env var (explicit override)
  if (process.env.CLAUDE_PATH) {
    if (existsSync(process.env.CLAUDE_PATH)) return process.env.CLAUDE_PATH;
    console.error(`Error: CLAUDE_PATH is set to "${process.env.CLAUDE_PATH}" but the file does not exist.`);
    process.exit(1);
  }

  // 2. Try "which" (macOS/Linux) or "where" (Windows)
  const isWindows = process.platform === "win32";
  const cmd = isWindows ? "where claude" : "which claude";
  try {
    const result = execSync(cmd, { stdio: "pipe" }).toString().trim();
    const lines = result.split("\n").map(l => l.trim()).filter(Boolean);
    // On Windows, "where" returns multiple matches (no-ext, .cmd, .ps1).
    // Prefer .cmd so resolveWindowsSpawn can extract the real node+script path.
    const found = isWindows
      ? (lines.find(l => l.toLowerCase().endsWith(".cmd")) || lines[0])
      : lines[0];
    // If the resolved path is a shell wrapper script (e.g. cmux), try to find
    // the real claude binary by querying which -a and picking the first
    // non-wrapper entry, or checking common Homebrew/npm paths.
    try {
      const content = readFileSync(found, "utf8");
      if (content.includes("find_real_claude") || content.includes("cmux")) {
        console.log(`[claude-resolver] "${found}" is a wrapper script, looking for real binary...`);
        try {
          const allPaths = execSync("which -a claude", { stdio: "pipe" }).toString().trim().split("\n");
          for (const p of allPaths) {
            const trimmed = p.trim();
            if (trimmed === found) continue;
            if (existsSync(trimmed)) {
              console.log(`[claude-resolver] Found real binary: ${trimmed}`);
              return trimmed;
            }
          }
        } catch {}
        // Fallback: check common paths
        const homebrewPath = "/opt/homebrew/bin/claude";
        if (existsSync(homebrewPath)) return homebrewPath;
      }
    } catch {}
    return found;
  } catch {
    // 3. Check common installation paths
    const candidates = isWindows
      ? [
          join(process.env.USERPROFILE || "", "AppData", "Local", "Programs", "claude", "claude.exe"),
          join(process.env.USERPROFILE || "", ".npm-global", "claude.cmd"),
        ]
      : [
          "/opt/homebrew/bin/claude",
          "/usr/local/bin/claude",
          join(process.env.HOME || "", ".npm-global/bin/claude"),
          join(process.env.HOME || "", ".local/bin/claude"),
        ];

    for (const p of candidates) {
      if (existsSync(p)) return p;
    }
  }

  console.error("");
  console.error("  Error: claude CLI not found.");
  console.error("");
  console.error("  Please install Claude Code:");
  console.error("    npm install -g @anthropic-ai/claude-code");
  console.error("");
  console.error("  Or set the CLAUDE_PATH environment variable:");
  console.error("    CLAUDE_PATH=/path/to/claude bash start.sh");
  console.error("");
  console.error("  More info: https://docs.anthropic.com/en/docs/claude-code/overview");
  console.error("");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
const MAX_BODY_SIZE = 100 * 1024; // 100 KB

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on("data", (c) => {
      size += c.length;
      if (size > MAX_BODY_SIZE) {
        req.destroy();
        reject(new Error("Request body too large"));
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString()));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// API authentication — Bearer token from SERVER_AUTH_TOKEN env var
// ---------------------------------------------------------------------------
const SERVER_AUTH_TOKEN = process.env.SERVER_AUTH_TOKEN || "";
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS || "").split(",").map(s => s.trim()).filter(Boolean);

function getCorsHeaders(req) {
  const origin = req.headers.origin || "";
  // If no ALLOWED_ORIGINS configured, allow same-origin only (no header)
  if (ALLOWED_ORIGINS.length === 0) return {};
  if (ALLOWED_ORIGINS.includes(origin)) {
    return { "Access-Control-Allow-Origin": origin, "Vary": "Origin" };
  }
  return {};
}

function authenticateRequest(req, res) {
  if (!SERVER_AUTH_TOKEN) return true; // No token configured = open (dev mode)
  const auth = req.headers.authorization;
  if (!auth || auth !== `Bearer ${SERVER_AUTH_TOKEN}`) {
    jsonResponse(res, 401, { error: "Unauthorized" });
    return false;
  }
  return true;
}

function jsonResponse(res, status, data) {
  const body = JSON.stringify(data);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(body);
}

// ---------------------------------------------------------------------------
// Session management
// ---------------------------------------------------------------------------
const sessions = new Map();

function getOrCreateSession(id) {
  let s = sessions.get(id);
  if (!s) {
    s = { sessionId: null, currentProcess: null };
    sessions.set(id, s);
  }
  return s;
}

// ---------------------------------------------------------------------------
// TTS handler — supports multiple providers
// ---------------------------------------------------------------------------
async function handleTts(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return jsonResponse(res, 400, { error: "invalid JSON" });
  }
  if (!body.text) return jsonResponse(res, 400, { error: "text required" });
  if (body.text.length > 1000) return jsonResponse(res, 400, { error: "text must be 1000 characters or less" });

  const provider = config.tts_provider;

  // Provider: none
  if (provider === "none") {
    return jsonResponse(res, 503, {
      error: "TTS not configured",
      hint: "Edit config/settings.yaml to set up a TTS provider.",
    });
  }

  // Provider: fish-audio (direct, user's own key)
  if (provider === "fish-audio") {
    if (!config.fish_audio_key || !config.fish_audio_model) {
      return jsonResponse(res, 500, { error: "fish_audio_key and fish_audio_model required in config/settings.yaml" });
    }
    return ttsViaFishAudio(body.text, config.fish_audio_key, config.fish_audio_model, res);
  }

  // Provider: voicevox (local engine)
  if (provider === "voicevox") {
    return ttsViaVoicevox(body.text, config.voicevox_url, config.voicevox_speaker, config.voicevox_api_key, res);
  }

  // Provider: cloud (billed proxy)
  if (provider === "cloud") {
    if (!config.cloud_api_key) {
      return jsonResponse(res, 500, { error: "api_key required for cloud TTS. Obtain one via the web UI signup flow." });
    }
    return ttsViaCloud(body.text, config.cloud_api_key, res);
  }

  return jsonResponse(res, 400, { error: `Unknown TTS provider: ${provider}` });
}

async function ttsViaFishAudio(text, key, model, res) {
  try {
    const response = await fetch("https://api.fish.audio/v1/tts", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        model: "s1",
      },
      body: JSON.stringify({
        text,
        reference_id: model,
        format: "mp3",
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[tts] Fish Audio error:", response.status, err);
      return jsonResponse(res, 502, { error: "TTS service error" });
    }

    res.writeHead(200, { "Content-Type": "audio/mpeg" });
    const buf = Buffer.from(await response.arrayBuffer());
    console.log("[tts]", buf.length, "bytes");
    res.end(buf);
  } catch (err) {
    console.error("[tts] error:", err.message);
    jsonResponse(res, 500, { error: "TTS service error" });
  }
}

async function ttsViaCloud(text, apiKey, res) {
  if (!CLOUD_TTS_API_URL) {
    return jsonResponse(res, 503, { error: "クラウドTTSが設定されていません。.env.localにCLOUD_TTS_API_URLを設定してください。" });
  }
  try {
    const response = await fetch(CLOUD_TTS_API_URL, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ text }),
    });

    if (!response.ok) {
      const err = await response.text();
      console.error("[tts] Cloud proxy error:", response.status, err);
      return jsonResponse(res, 502, { error: "TTS service error" });
    }

    res.writeHead(200, { "Content-Type": "audio/mpeg" });
    const buf = Buffer.from(await response.arrayBuffer());
    console.log("[tts]", buf.length, "bytes");
    res.end(buf);
  } catch (err) {
    console.error("[tts] error:", err.message);
    jsonResponse(res, 500, { error: "TTS service error" });
  }
}

async function ttsViaVoicevox(text, baseUrl, speaker, apiKey, res) {
  const headers = apiKey ? { "X-API-Key": apiKey } : {};
  try {
    // Step 1: Generate audio query
    const queryRes = await fetch(
      `${baseUrl}/audio_query?text=${encodeURIComponent(text)}&speaker=${speaker}`,
      { method: "POST", headers }
    );
    if (!queryRes.ok) {
      const err = await queryRes.text();
      console.error("[tts] VOICEVOX audio_query error:", queryRes.status, err);
      return jsonResponse(res, 502, { error: "TTS service error" });
    }
    const audioQuery = await queryRes.json();

    // Speed tuning: faster speech + shorter silence around each chunk so
    // sentences flow into each other more naturally.
    audioQuery.speedScale = 1.2;
    audioQuery.prePhonemeLength = 0.05;
    audioQuery.postPhonemeLength = 0.05;

    // Step 2: Synthesize speech
    const synthRes = await fetch(
      `${baseUrl}/synthesis?speaker=${speaker}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", ...headers },
        body: JSON.stringify(audioQuery),
      }
    );
    if (!synthRes.ok) {
      const err = await synthRes.text();
      console.error("[tts] VOICEVOX synthesis error:", synthRes.status, err);
      return jsonResponse(res, 502, { error: "TTS service error" });
    }

    res.writeHead(200, { "Content-Type": "audio/wav" });
    const buf = Buffer.from(await synthRes.arrayBuffer());
    console.log("[tts] voicevox", buf.length, "bytes");
    res.end(buf);
  } catch (err) {
    console.error("[tts] voicevox error:", err.message);
    jsonResponse(res, 500, { error: "TTS service error" });
  }
}

// ---------------------------------------------------------------------------
// Chat handler (SSE) — spawns claude CLI
// ---------------------------------------------------------------------------
async function handleChat(req, res, claudePath) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    return jsonResponse(res, 400, { error: "invalid JSON" });
  }
  if (!body.content) return jsonResponse(res, 400, { error: "content required" });

  // Validate sessionId to prevent command injection — must be alphanumeric/hyphens only
  if (body.sessionId !== undefined && !/^[a-zA-Z0-9_-]{0,128}$/.test(body.sessionId)) {
    return jsonResponse(res, 400, { error: "invalid sessionId" });
  }

  const clientId = body.clientId ?? "default";
  const session = getOrCreateSession(clientId);

  if (session.currentProcess) {
    session.currentProcess.kill("SIGTERM");
    session.currentProcess = null;
  }

  const rawResumeId = body.sessionId ?? session.sessionId;
  // Pass prompt via stdin (not as a CLI arg) to avoid command-line injection.
  // "-p" without a value enables print mode; the prompt is read from stdin.
  const args = ["-p", "--output-format", "stream-json", "--verbose",
    "--append-system-prompt", "あなたはずんだもんです。語尾は必ず「なのだ」「のだ」で統一してください。一人称は「ぼく」です。明るく元気に話してください。"];
  if (rawResumeId) args.push("--resume", sanitizeSessionId(rawResumeId));
  const allowed = ["default", "plan", "full"];
  const mode = allowed.includes(body.permissionMode)
    ? body.permissionMode
    : (config.permission_mode || "full");
  if (mode === "full") args.push("--dangerously-skip-permissions");
  else if (mode === "plan") args.push("--permission-mode", "plan");

  // cwd is server-controlled only — ignore client input
  const cwd = config.cwd || process.cwd();
  console.log("[spawn] claude", args.join(" "));

  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...getCorsHeaders(req),
  });

  function sendEvent(data) {
    if (!res.destroyed) {
      res.write(`data: ${JSON.stringify(data)}\n\n`);
    }
  }

  // On Windows, .cmd files cannot be spawned directly.
  // Prefer extracting the underlying node + script path from the .cmd file so
  // we can spawn node directly (no shell involved, no injection risk).
  // Fall back to cmd /c only if parsing fails.
  const [spawnCmd, spawnArgs] = resolveWindowsSpawn(claudePath, args);
  const proc = spawn(spawnCmd, spawnArgs, {
    cwd,
    env: { ...process.env },
    stdio: ["pipe", "pipe", "pipe"],
  });

  // Write the user prompt to stdin and close it — never passes through the CLI args
  proc.stdin.write(body.content);
  proc.stdin.end();

  session.currentProcess = proc;
  let buffer = "";
  let hadToolUse = false;

  proc.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const event = JSON.parse(line);
        if (event.session_id) session.sessionId = event.session_id;
        if (event.type === "assistant" && Array.isArray(event.message?.content)) {
          if (event.message.content.some(b => b.type === "tool_use")) hadToolUse = true;
        }
        sendEvent(event);
      } catch {
        sendEvent({ type: "raw", content: line });
      }
    }
  });

  proc.stderr.on("data", (chunk) => {
    console.log("[stderr]", chunk.toString().substring(0, 200));
  });

  proc.on("close", (code, _signal) => {
    if (buffer.trim()) {
      try {
        const event = JSON.parse(buffer);
        if (event.session_id) session.sessionId = event.session_id;
        sendEvent(event);
      } catch {
        sendEvent({ type: "raw", content: buffer });
      }
      buffer = "";
    }
    sendEvent({ type: "done", code, sessionId: session.sessionId, awaitingApproval: mode === "default" && hadToolUse });
    session.currentProcess = null;
    res.end();
  });

  proc.on("error", (err) => {
    console.error("[process] error:", err.message);
    sendEvent({ type: "error", content: err.message });
    session.currentProcess = null;
    res.end();
  });

  req.on("close", () => {
    if (session.currentProcess === proc) {
      proc.kill("SIGTERM");
      session.currentProcess = null;
    }
  });
}

// ---------------------------------------------------------------------------
// Abort handler
// ---------------------------------------------------------------------------
async function handleAbort(req, res) {
  let body;
  try {
    body = JSON.parse(await readBody(req));
  } catch {
    body = {};
  }
  const clientId = body.clientId ?? "default";
  const session = sessions.get(clientId);
  if (session?.currentProcess) {
    session.currentProcess.kill("SIGTERM");
    session.currentProcess = null;
  }
  jsonResponse(res, 200, { ok: true });
}

// ---------------------------------------------------------------------------
// Approve handler — resumes session with full permissions after 確認 mode
// ---------------------------------------------------------------------------
async function handleApprove(req, res, claudePath) {
  let body;
  try { body = JSON.parse(await readBody(req)); } catch { body = {}; }
  const clientId = body.clientId ?? "default";
  const session = getOrCreateSession(clientId);
  if (!session.sessionId) {
    return jsonResponse(res, 400, { error: "No session to approve" });
  }
  if (session.currentProcess) {
    session.currentProcess.kill("SIGTERM");
    session.currentProcess = null;
  }
  const args = ["-p", "--output-format", "stream-json", "--verbose",
    "--append-system-prompt", "あなたはずんだもんです。語尾は必ず「なのだ」「のだ」で統一してください。一人称は「ぼく」です。明るく元気に話してください。",
    "--resume", sanitizeSessionId(session.sessionId),
    "--dangerously-skip-permissions",
  ];
  const cwd = config.cwd || process.cwd();
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    ...getCorsHeaders(req),
  });
  function sendEvent(data) {
    if (!res.destroyed) res.write(`data: ${JSON.stringify(data)}\n\n`);
  }
  const [spawnCmd, spawnArgs] = resolveWindowsSpawn(claudePath, args);
  const proc = spawn(spawnCmd, spawnArgs, { cwd, env: { ...process.env }, stdio: ["pipe", "pipe", "pipe"] });
  session.currentProcess = proc;
  proc.stdin.write("承認された。先ほどの計画どおりに実行してください。");
  proc.stdin.end();
  let buffer = "";
  proc.stdout.on("data", (chunk) => {
    buffer += chunk.toString();
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.trim()) continue;
      try {
        const ev = JSON.parse(line);
        if (ev.session_id) session.sessionId = ev.session_id;
        sendEvent(ev);
      } catch {
        sendEvent({ type: "raw", content: line });
      }
    }
  });
  proc.on("close", (code) => {
    if (buffer.trim()) {
      try { const ev = JSON.parse(buffer); if (ev.session_id) session.sessionId = ev.session_id; sendEvent(ev); } catch {}
      buffer = "";
    }
    sendEvent({ type: "done", code, sessionId: session.sessionId });
    session.currentProcess = null;
    if (!res.destroyed) res.end();
  });
  proc.on("error", (err) => {
    sendEvent({ type: "error", content: err.message });
    session.currentProcess = null;
    if (!res.destroyed) res.end();
  });
  proc.stderr.on("data", (d) => {
    console.log("[approve stderr]", d.toString().substring(0, 200));
  });
  req.on("close", () => {
    if (session.currentProcess === proc) {
      proc.kill("SIGTERM");
      session.currentProcess = null;
    }
  });
}

// ---------------------------------------------------------------------------
// Config API (provides settings to the frontend)
// ---------------------------------------------------------------------------
function handleConfig(res) {
  jsonResponse(res, 200, {
    cwd: config.cwd,
    tts_provider: config.tts_provider,
  });
}

// ---------------------------------------------------------------------------
// Static file server
// ---------------------------------------------------------------------------
function serveStatic(pathname, res) {
  // Stripe から拡張子なしで戻ってくる URL (/billing/success, /billing/cancel) を .html にマップ
  if (pathname === "/billing/success") pathname = "/billing/success.html";
  if (pathname === "/billing/cancel") pathname = "/billing/cancel.html";
  let filePath = join(PUBLIC_DIR, pathname === "/" ? "index.html" : pathname);

  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    res.end("Forbidden");
    return;
  }

  if (!existsSync(filePath)) {
    res.writeHead(404);
    res.end("Not Found");
    return;
  }

  const ext = extname(filePath).toLowerCase();
  const contentType = MIME[ext] ?? "application/octet-stream";

  try {
    const data = readFileSync(filePath);
    res.writeHead(200, { "Content-Type": contentType });
    res.end(data);
  } catch {
    res.writeHead(500);
    res.end("Internal Server Error");
  }
}

// ---------------------------------------------------------------------------
// Cloud backend proxy (for auth, usage, and authenticated TTS)
// ---------------------------------------------------------------------------
const CLOUD_BACKEND_URL = process.env.CLOUD_BACKEND_URL || "";
const CLOUD_TTS_API_URL = process.env.CLOUD_TTS_API_URL || "";

async function proxyToCloud(req, res, path, { method, forwardAuth = false } = {}) {
  const reqMethod = method || req.method;
  const body = reqMethod !== "GET" ? await readBody(req) : null;
  const headers = { "Content-Type": "application/json" };
  if (forwardAuth && req.headers.authorization) {
    headers["Authorization"] = req.headers.authorization;
  }

  if (!CLOUD_BACKEND_URL) {
    return jsonResponse(res, 503, { error: "Cloud backend not configured. Set CLOUD_BACKEND_URL in .env" });
  }

  try {
    const response = await fetch(`${CLOUD_BACKEND_URL}${path}`, {
      method: reqMethod,
      headers,
      ...(body ? { body } : {}),
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("audio/")) {
      const buf = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, { "Content-Type": contentType });
      res.end(buf);
    } else {
      const data = await response.text();
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(data);
    }
  } catch (err) {
    console.error("[proxy] error:", err.message);
    jsonResponse(res, 502, { error: "Cloud backend unreachable" });
  }
}

async function handleAuthRegister(req, res) {
  return proxyToCloud(req, res, "/auth/register");
}

async function handleAuthLogin(req, res) {
  return proxyToCloud(req, res, "/auth/login");
}

async function handleAuthChangePassword(req, res) {
  return proxyToCloud(req, res, "/auth/change-password", { forwardAuth: true });
}

async function handleAuthDeleteAccount(req, res) {
  return proxyToCloud(req, res, "/auth/account", { forwardAuth: true });
}

async function handleUsage(req, res) {
  return proxyToCloud(req, res, "/usage", { method: "GET", forwardAuth: true });
}

async function handleCloudTts(req, res) {
  const body = await readBody(req);
  const headers = {
    "Content-Type": "application/json",
    "Authorization": req.headers.authorization,
  };

  if (!CLOUD_BACKEND_URL) {
    return jsonResponse(res, 503, { error: "Cloud backend not configured" });
  }

  try {
    const response = await fetch(`${CLOUD_BACKEND_URL}/v1/tts`, {
      method: "POST",
      headers,
      body,
    });

    const contentType = response.headers.get("content-type") || "";
    if (contentType.includes("audio/")) {
      const buf = Buffer.from(await response.arrayBuffer());
      res.writeHead(response.status, { "Content-Type": contentType });
      console.log("[tts] cloud", buf.length, "bytes");
      res.end(buf);
    } else {
      const data = await response.text();
      res.writeHead(response.status, { "Content-Type": "application/json" });
      res.end(data);
    }
  } catch (err) {
    console.error("[tts] cloud error:", err.message);
    jsonResponse(res, 502, { error: "Cloud TTS unreachable" });
  }
}

// ---------------------------------------------------------------------------
// Main server
// ---------------------------------------------------------------------------
const claudePath = resolveClaudePath();

const server = createServer(async (req, res) => {
  const url = new URL(req.url ?? "/", `http://${req.headers.host}`);
  const pathname = url.pathname;

  // CORS preflight
  if (req.method === "OPTIONS") {
    const cors = getCorsHeaders(req);
    res.writeHead(204, {
      ...cors,
      "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    });
    res.end();
    return;
  }

  // Auth & usage proxy routes
  if (pathname === "/api/auth/register" && req.method === "POST") return handleAuthRegister(req, res);
  if (pathname === "/api/auth/login" && req.method === "POST") return handleAuthLogin(req, res);
  if (pathname === "/api/auth/change-password" && req.method === "POST") {
    if (!req.headers.authorization) {
      return jsonResponse(res, 401, { error: "login_required" });
    }
    return handleAuthChangePassword(req, res);
  }
  if (pathname === "/api/auth/account" && req.method === "DELETE") {
    if (!req.headers.authorization) {
      return jsonResponse(res, 401, { error: "login_required" });
    }
    return handleAuthDeleteAccount(req, res);
  }
  if (pathname === "/api/usage" && req.method === "GET") return handleUsage(req, res);

  // Billing proxy routes — login required
  if (pathname === "/api/billing/checkout" && req.method === "POST") {
    if (!req.headers.authorization) {
      return jsonResponse(res, 401, { error: "login_required" });
    }
    return proxyToCloud(req, res, "/billing/checkout", { forwardAuth: true });
  }
  if (pathname === "/api/billing/portal" && req.method === "POST") {
    if (!req.headers.authorization) {
      return jsonResponse(res, 401, { error: "login_required" });
    }
    return proxyToCloud(req, res, "/billing/portal", { forwardAuth: true });
  }

  // TTS: login required. All requests go through cloud backend for usage tracking.
  if (pathname === "/api/tts" && req.method === "POST") {
    if (!req.headers.authorization) {
      return jsonResponse(res, 401, {
        error: "login_required",
        message: "音声機能をお使いいただくにはログインが必要です",
      });
    }
    if (!CLOUD_BACKEND_URL) {
      return jsonResponse(res, 503, {
        error: "cloud_backend_unavailable",
        message: "音声サービスに接続できません。時間を置いて再度お試しください。",
      });
    }
    return handleCloudTts(req, res);
  }

  if (pathname === "/api/chat" && req.method === "POST") {
    if (!req.headers.authorization) {
      return jsonResponse(res, 401, {
        error: "login_required",
        message: "チャットをお使いいただくにはログインが必要です",
      });
    }
    return handleChat(req, res, claudePath);
  }
  if (pathname === "/api/abort" && req.method === "POST") {
    if (!req.headers.authorization) {
      return jsonResponse(res, 401, { error: "login_required" });
    }
    return handleAbort(req, res);
  }
  if (pathname === "/api/approve" && req.method === "POST") {
    if (!req.headers.authorization) {
      return jsonResponse(res, 401, { error: "login_required" });
    }
    return handleApprove(req, res, claudePath);
  }
  if (pathname === "/api/config" && req.method === "GET") {
    if (!authenticateRequest(req, res)) return;
    return handleConfig(res);
  }

  serveStatic(pathname, res);
});

server.listen(PORT, "127.0.0.1", () => {
  console.log("");
  console.log("  🟢 コードだもん (codedamon)");
  console.log(`  http://localhost:${PORT}`);
  console.log("");
  console.log(`  TTS provider: ${config.tts_provider}`);
  console.log(`  Cloud backend: ${CLOUD_BACKEND_URL || "(not configured)"}`);
  console.log(`  Working dir:  ${config.cwd}`);
  console.log("");
});
