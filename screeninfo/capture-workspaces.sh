#!/usr/bin/env bash
# Capture screenshots of every A.R.C. workspace + key UI overlays via agent-browser
# connected to the running Electron app over CDP.
#
#   npx electron-vite dev --remoteDebuggingPort 9222
#   bash screeninfo/capture-workspaces.sh
#
# Files land next to this script as NN-<workspace>.png
set -u

PORT="${CDP_PORT:-9222}"
OUT="$(cd "$(dirname "$0")" && pwd)"
SETTLE="${SETTLE:-1.6}"

ab() { agent-browser --cdp "$PORT" "$@"; }

# Switch the active workspace tab through the app's own Pinia store.
set_tab() {
  printf "(() => { const r = document.querySelector('[data-v-app]'); const p = r.__vue_app__.config.globalProperties['\$pinia']; const ui = p._s.get('ui'); ui.setActiveTab('%s'); return ui.activeTab; })()" "$1" \
    | ab eval --stdin 2>/dev/null | tr -d '\r'
}

# Run JS with `ui` (ui store) and `s` (settings store) in scope.
store_eval() {
  printf "(() => { const r = document.querySelector('[data-v-app]'); const p = r.__vue_app__.config.globalProperties['\$pinia']; const ui = p._s.get('ui'); const s = p._s.get('settings'); %s })()" "$1" \
    | ab eval --stdin 2>/dev/null | tr -d '\r'
}

click_subsystems_menu() {
  ab eval --stdin <<'JS' >/dev/null 2>&1
(() => { const b = document.querySelector('button[title="Список подсистем"]'); if (b) b.click(); return !!b; })()
JS
}

shoot() { # $1 = file stem, $2 = tab name
  local file="$OUT/$1.png" tab="$2" got
  got="$(set_tab "$tab")"
  if ! printf '%s' "$got" | grep -q "\"$tab\""; then
    echo "[FAIL] $1 (tab=$tab, store returned: ${got:-no response})"
    return 1
  fi
  sleep "$SETTLE"
  if ab screenshot "$file" >/dev/null 2>&1; then
    echo "[ok]   $1  <- tab '$tab'"
  else
    echo "[FAIL] $1 (screenshot error)"
    return 1
  fi
}

shoot 01-core core
shoot 02-chat chat
shoot 03-objectives objectives
shoot 04-tasks tasks
shoot 05-files files
shoot 06-memory memory
shoot 07-commands commands
shoot 08-audio-transcription transcription
shoot 09-vision vision
shoot 10-settings settings
shoot 11-modules modules
shoot 12-fallback-agents agents

# Extra UI surfaces -----------------------------------------------------------
# Caveat: with the default bottom-dock tab bar the "Подсистемы A.R.C." dropdown is
# clipped by the dock's overflow:hidden and never paints, so it is captured with the
# tab bar temporarily in the top position (setting restored afterwards).
store_eval "s.tabBarPosition='top'; ui.setActiveTab('core'); return s.tabBarPosition;" >/dev/null
sleep 1.5
click_subsystems_menu
sleep 1
ab screenshot "$OUT/13-modules-menu-topbar.png" >/dev/null 2>&1 && echo "[ok]   13-modules-menu-topbar"
click_subsystems_menu   # close the dropdown again
store_eval "s.tabBarPosition='bottom'; return s.tabBarPosition;" >/dev/null
sleep 1.5

# Spotlight: opened through the app's own event. Ctrl+K is advertised in the UI but
# is not bound in this dev build, so the event is dispatched directly.
store_eval "ui.setActiveTab('agents'); return ui.activeTab;" >/dev/null
sleep 1.2
ab eval --stdin <<'JS' >/dev/null 2>&1
(() => { window.dispatchEvent(new CustomEvent('open-spotlight')); return true; })()
JS
sleep 1
ab screenshot "$OUT/14-spotlight.png" >/dev/null 2>&1 && echo "[ok]   14-spotlight"
ab press Escape >/dev/null 2>&1
sleep 0.5

set_tab core >/dev/null
echo "done -> $OUT"
