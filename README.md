<div align="center">

# codedamon (コードだもん)

**Talk to Claude Code through Zundamon — your AI coding companion with a voice.**

Chat with Claude Code via a cute Zundamon avatar interface. Voice input, voice output, spring physics animations. Zero dependencies.

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)]()
[![Claude Code](https://img.shields.io/badge/Claude_Code-required-blue)]()

[English](README.md) | [Japanese](README_ja.md)

</div>

> **Note:** This repository contains only the local chat UI (`server/` + `public/`). The cloud backend implementation (auth, billing, rate-limiting) that powers [codedamon.renue.co.jp](https://codedamon.renue.co.jp) is managed separately by [renue Inc.](https://renue.co.jp) and is not included here.

---

## Quick Start

**Requirements:** Node.js 18+, [Claude Code](https://docs.anthropic.com/en/docs/claude-code/overview)

```bash
git clone https://github.com/renueinc/codedamon
cd codedamon
bash setup.sh       # one-time setup
bash start.sh       # launch → opens browser
```

That's it. Chat with Claude Code through Zundamon.

---

## What is this?

A web-based chat UI that connects to Claude Code with a Zundamon character avatar.

```
┌─────────────────────────────────────────────────┐
│  Browser (localhost:3456)                       │
│  ┌────────────────────┐  ┌──────────────────┐   │
│  │                    │  │   Zundamon       │   │
│  │   Chat messages    │  │   Avatar         │   │
│  │   (streaming)      │  │   (animated)     │   │
│  │                    │  │                  │   │
│  └────────────────────┘  └──────────────────┘   │
│  [Message input...              ] [🎤] [Send]   │
└─────────────────────────────────────────────────┘
         │                    │
         ▼                    ▼
   claude CLI (local)    TTS API (optional)
```

### Features

- **Chat with Claude Code** — Full Claude Code power through a web UI
- **Zundamon avatar** — Animated character with idle, thinking, talking, happy, error states
- **Voice output** — Zundamon reads responses aloud (optional, requires TTS setup)
- **Voice input** — Speak your messages using browser speech recognition
- **Session persistence** — Conversations resume across page reloads
- **Tool visualization** — See which tools Claude uses (Read, Write, Bash, etc.)
- **Zero dependencies** — Pure Node.js built-in modules only

---

## Voice Setup (Optional)

Voice is optional. The chat and avatar work perfectly without it.

### Option 1: Fish Audio (Bring Your Own Key)

1. Get an API key at [fish.audio](https://fish.audio)
2. Edit `config/settings.yaml`:

```yaml
tts:
  provider: fish-audio
  fish_audio_key: "your_key"
  fish_audio_model: "your_model_id"
```

3. Restart the server

### Option 2: Cloud Proxy (Managed)

Coming soon. Managed TTS service with pay-as-you-go billing.

---

## Configuration

All settings are in `config/settings.yaml`:

```yaml
port: 3456                    # Server port
cwd: /path/to/your/project    # Default working directory

tts:
  provider: none              # none | fish-audio | cloud
```

---

## Requirements

| Requirement | Version | How to check |
|-------------|---------|-------------|
| **Node.js** | 18+ | `node --version` |
| **Claude Code** | any | `claude --version` |

### Installing Claude Code

```bash
npm install -g @anthropic-ai/claude-code
```

Or see the [official docs](https://docs.anthropic.com/en/docs/claude-code/overview) for other installation methods (Homebrew, desktop app, etc.).

---

## Troubleshooting

### `claude` CLI not found / ENOENT error

The server needs to find the `claude` command. It searches in this order:

1. `CLAUDE_PATH` environment variable (if set)
2. System PATH (`which claude` / `where claude`)
3. Common locations (`/usr/local/bin/claude`, `~/.npm-global/bin/claude`, etc.)

**If you installed Claude Code via desktop app or a non-standard location**, set the path explicitly:

```bash
# Find where claude is installed
which claude           # macOS/Linux
where claude           # Windows

# Set it explicitly
export CLAUDE_PATH=/your/path/to/claude
bash start.sh
```

Or add it to `~/.bashrc` / `~/.zshrc`:

```bash
export CLAUDE_PATH=/Applications/cmux.app/Contents/Resources/bin/claude
```

### Port already in use

Edit `config/settings.yaml` and change the port number, then restart:

```yaml
port: 3457
```

### Windows users

`setup.sh` requires bash. Follow these steps manually instead:

**1. Create `config/settings.yaml`** (copy from `config/settings.yaml.example` or create it):

```yaml
port: 3456
cwd: C:\path\to\your\project

tts:
  provider: cloud   # or none
```

**2. Create `.env.local`** in the project root with your backend URL:

```
CLOUD_BACKEND_URL=https://your-backend-url
```

> If you downloaded a `.env.zundamon` file from the account screen, rename it to `.env.local` and place it in the project root. The `CLOUD_API_KEY` inside is stored automatically in your browser — you do not need it in this file. Only `CLOUD_BACKEND_URL` is required here.

**3. Start the server** using Git Bash, WSL, or any terminal:

```bash
node server/serve.js --port 3456 --public ./public --config ./config/settings.yaml
```

---

## Architecture

| Component | Description |
|-----------|-------------|
| `server/serve.js` | Node.js HTTP server (zero deps) |
| `public/index.html` | Single-file frontend (~900 lines) |
| `config/settings.yaml` | User configuration |
| `setup.sh` | First-time setup script |
| `start.sh` | Launch script |

The server binds to `127.0.0.1` only (localhost). No network exposure.

---

## Character Assets

Zundamon character assets are from [zunko.jp](https://zunko.jp/) official materials.

Please review the [Zundamon guidelines](https://zunko.jp/guideline.html) for usage terms.

---

## License

MIT — see [LICENSE](LICENSE)
