#!/bin/bash
# KarkasCut — idempotent launcher. Backend :3050 + web studio :3000.
# Detects what's already running and only starts what's missing — never a duplicate.
cd "$(cd "$(dirname "$0")" && pwd)" || exit 1

LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost")

is_up() { curl -s -o /dev/null --max-time 2 "$1"; }
free_port() {
  local pid
  pid=$(lsof -ti:"$1" 2>/dev/null)
  [ -n "$pid" ] && { echo "🧹 משחרר פורט $1 ($pid)"; echo "$pid" | xargs kill -9 2>/dev/null; sleep 1; }
}

PIDS=()

# --- backend (3050) ---
if is_up "http://localhost:3050/api/health"; then
  echo "✅ שרת עיבוד כבר רץ על :3050"
else
  free_port 3050
  echo "⚙️  מפעיל שרת עיבוד (:3050)..."
  npx tsx watch src/server/index.ts &
  PIDS+=($!)
  sleep 2
fi

# --- web studio (3000) ---
if is_up "http://localhost:3000/"; then
  echo "✅ סטודיו כבר רץ על :3000"
else
  free_port 3000
  echo "💻 מפעיל סטודיו Web (:3000)..."
  npx vite --host 0.0.0.0 --port 3000 &
  PIDS+=($!)
  sleep 2
fi

echo "=================================================="
echo "🎬 KarkasCut  →  http://localhost:3000"
echo "📱 באפליקציית המובייל: הגדרות → כתובת שרת → http://$LOCAL_IP:3050"
echo "=================================================="
open "http://localhost:3000"

# Only wait on / clean up servers THIS script started.
if [ ${#PIDS[@]} -gt 0 ]; then
  trap 'echo; echo "🛑 עוצר את מה שהסקריפט הפעיל..."; kill "${PIDS[@]}" 2>/dev/null' SIGINT SIGTERM EXIT
  wait
else
  echo "(שני השרתים כבר היו למעלה — אין מה להפעיל)"
fi
