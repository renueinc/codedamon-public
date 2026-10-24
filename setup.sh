#!/usr/bin/env bash
# ============================================================
# setup.sh - codedamon (コードだもん) initial setup
# ============================================================
set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
NC='\033[0m'
BOLD='\033[1m'

log_info()    { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[OK]${NC} $1"; }
log_warn()    { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error()   { echo -e "${RED}[ERROR]${NC} $1"; }
log_step()    { echo -e "\n${CYAN}${BOLD}━━━ $1 ━━━${NC}\n"; }

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

HAS_ERROR=false

echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║  🟢 コードだもん (codedamon) setup                       ║"
echo "  ║     Zundamon Avatar Chat for Claude Code                 ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""

# ============================================================
# STEP 1: System check
# ============================================================
log_step "STEP 1: System check"

# OS
UNAME_S="$(uname -s)"
if [ "$UNAME_S" = "Darwin" ]; then
    OS_NAME="macOS"
    OS_VERSION="$(sw_vers -productVersion 2>/dev/null || echo 'unknown')"
elif [ -f /etc/os-release ]; then
    . /etc/os-release
    OS_NAME=$NAME
    OS_VERSION=$VERSION_ID
else
    OS_NAME="Unknown"
    OS_VERSION=""
fi
log_info "OS: $OS_NAME $OS_VERSION"

# Node.js
if command -v node &>/dev/null; then
    NODE_VERSION="$(node --version)"
    if node -e 'const [major, minor, patch] = process.versions.node.split(".").map(Number); const minimum = new Map([[22, [23, 4]], [24, [22, 1]], [26, [12, 1]]]).get(major); if (!minimum || minor < minimum[0] || (minor === minimum[0] && patch < minimum[1])) process.exit(1);'; then
        log_success "Node.js: $NODE_VERSION"
    else
        log_error "Node.js $NODE_VERSION is unsupported. Use 22.23.4+ (22.x), 24.22.1+ (24.x), or 26.12.1+ (26.x)."
        HAS_ERROR=true
    fi
else
    log_error "Node.js not found. Install it: https://nodejs.org/"
    HAS_ERROR=true
fi

# claude CLI
if command -v claude &>/dev/null; then
    CLAUDE_PATH="$(command -v claude)"
    log_success "claude CLI: $CLAUDE_PATH"
elif [ -x "/usr/local/bin/claude" ]; then
    log_success "claude CLI: /usr/local/bin/claude"
elif [ -x "$HOME/.npm-global/bin/claude" ]; then
    log_success "claude CLI: $HOME/.npm-global/bin/claude"
else
    log_error "claude CLI not found."
    log_info "Install: npm install -g @anthropic-ai/claude-code"
    log_info "Or set CLAUDE_PATH env var: export CLAUDE_PATH=/path/to/claude"
    log_info "Details: https://docs.anthropic.com/en/docs/claude-code/overview"
    HAS_ERROR=true
fi

if [ "$HAS_ERROR" = true ]; then
    echo ""
    log_error "Please fix the errors above and run setup.sh again."
    exit 1
fi

# ============================================================
# STEP 2: Configuration
# ============================================================
log_step "STEP 2: Configuration"

CONFIG_FILE="$SCRIPT_DIR/config/settings.yaml"

if [ -f "$CONFIG_FILE" ]; then
    log_info "config/settings.yaml already exists. Skipping."
    log_info "Edit it manually to change settings."
else
    # Port
    DEFAULT_PORT=3456
    read -p "  Port number [$DEFAULT_PORT]: " USER_PORT
    PORT="${USER_PORT:-$DEFAULT_PORT}"

    # CWD
    DEFAULT_CWD="$(pwd)"
    read -p "  Working directory [$DEFAULT_CWD]: " USER_CWD
    CWD="${USER_CWD:-$DEFAULT_CWD}"

    cat > "$CONFIG_FILE" <<EOF
# codedamon (コードだもん) configuration
# Edit this file to change settings. Restart the server after changes.

# Server
port: $PORT
cwd: $CWD

# TTS (Text-to-Speech) configuration
# Choose one provider:
#
# Option 1: Cloud proxy (default — uses CLOUD_API_KEY from .env.local)
#   provider: cloud
#
# Option 2: Your own Fish Audio API key (free, self-hosted)
#   provider: fish-audio
#   fish_audio_key: "your_key"
#   fish_audio_model: "your_model_id"
#
# Option 3: No voice
#   provider: none
tts:
  provider: cloud
EOF

    log_success "Created config/settings.yaml"
fi

# ============================================================
# STEP 3: TTS setup (optional)
# ============================================================
log_step "STEP 3: Voice setup (optional)"

echo "  Voice (TTS) lets Zundamon speak responses aloud."
echo "  You can change this later in config/settings.yaml."
echo ""
echo "  [1] Cloud TTS (default — works after signup in the web UI)"
echo "  [2] Fish Audio (bring your own API key)"
echo "  [3] No voice"
echo ""
read -p "  Choose [1]: " TTS_CHOICE
TTS_CHOICE="${TTS_CHOICE:-1}"

if [ "$TTS_CHOICE" = "2" ]; then
    read -p "  Fish Audio API key: " FISH_KEY
    read -p "  Fish Audio model ID: " FISH_MODEL
    if [ -n "$FISH_KEY" ] && [ -n "$FISH_MODEL" ]; then
        sed -i.bak 's/provider: cloud/provider: fish-audio/' "$CONFIG_FILE"
        sed -i.bak "/provider: fish-audio/a\\
  fish_audio_key: \"$FISH_KEY\"\\
  fish_audio_model: \"$FISH_MODEL\"" "$CONFIG_FILE"
        rm -f "${CONFIG_FILE}.bak"
        log_success "TTS configured with Fish Audio"
    else
        log_warn "Missing key or model. Keeping cloud TTS default."
    fi
elif [ "$TTS_CHOICE" = "3" ]; then
    sed -i.bak 's/provider: cloud/provider: none/' "$CONFIG_FILE"
    rm -f "${CONFIG_FILE}.bak"
    log_info "Voice disabled. Chat + avatar will work fine."
else
    log_success "Cloud TTS enabled (requires signup in the web UI)"
fi

# ============================================================
# Done
# ============================================================
echo ""
echo "  ╔══════════════════════════════════════════════════════════╗"
echo "  ║  Setup complete!                                        ║"
echo "  ║                                                          ║"
echo "  ║  Start the server:                                       ║"
echo "  ║    bash start.sh                                         ║"
echo "  ║                                                          ║"
echo "  ║  Then open: http://localhost:${PORT:-3456}                        ║"
echo "  ╚══════════════════════════════════════════════════════════╝"
echo ""
