#!/usr/bin/env bash
# ============================================================
# start.sh - Launch codedamon (コードだもん) server
# ============================================================
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CONFIG_FILE="$SCRIPT_DIR/config/settings.yaml"

if [ ! -f "$CONFIG_FILE" ]; then
    echo "Config not found. Running setup first..."
    bash "$SCRIPT_DIR/setup.sh"
fi

# Ensure CLOUD_BACKEND_URL is set in .env.local so first-time users can register
# without manual configuration. Existing entries are preserved.
ENV_LOCAL="$SCRIPT_DIR/.env.local"
PROD_BACKEND_URL="https://zundamon-voicevox-auth.graystone-def67eb7.japaneast.azurecontainerapps.io"

if [ ! -f "$ENV_LOCAL" ]; then
    echo "CLOUD_BACKEND_URL=$PROD_BACKEND_URL" > "$ENV_LOCAL"
elif ! grep -q "^CLOUD_BACKEND_URL=" "$ENV_LOCAL"; then
    echo "CLOUD_BACKEND_URL=$PROD_BACKEND_URL" >> "$ENV_LOCAL"
fi

PORT=$(grep "^port:" "$CONFIG_FILE" 2>/dev/null | awk '{print $2}' || echo 3456)

echo ""
echo "  🟢 コードだもん"
echo "  http://localhost:$PORT"
echo ""

# Open browser after a short delay
(sleep 1 && {
    if command -v open &>/dev/null; then
        open "http://localhost:$PORT"
    elif command -v xdg-open &>/dev/null; then
        xdg-open "http://localhost:$PORT"
    fi
}) &

exec node "$SCRIPT_DIR/server/serve.js" \
    --port "$PORT" \
    --public "$SCRIPT_DIR/public" \
    --config "$CONFIG_FILE"
