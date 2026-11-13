# UI Etalon Frames & Constitution Baseline v1.2.0

## Phase 0: Baseline & Reference Frames

In accordance with Master-TZ v1.2.0-ui («Матовое ядро, живая рама»), this directory contains reference specifications, metrics, and snapshots for visual verification across all workspaces:

1. **Core Frame (3D Reactor in repose & HUD)**
   - Dominant black cosmos `#000000`
   - Active WebGL Reactor Core with controlled emission
   - HUD elements using `#0B0B0B` surfaces, 14px radius, top-left 2px bracket, no blur over canvas

2. **Settings 1 (Navigation & General Appearance)**
   - Navigation rail width: 232px, fill `#070707`, without blur
   - Reading plane: `#0B0B0B`, radius 20px
   - Projection frame: 24px sides, 20px bottom, `#070707`, 4 corner brackets (28×28px, 1px, `rgba(var(--accent-rgb), 0.22)`)
   - Header line: 1px gradient accent `rgba(var(--accent-rgb), 0.30)`

3. **Settings 2 (Intelligence, Providers & Routing)**
   - 3-state "Where to think" routing
   - Transparent, honest provider statuses (no fake states)
   - Step checklist with real progress, danger zone with double confirmation

4. **Tasks Workspace (Console & Lists)**
   - Plain `#0B0B0B` workspace plane
   - Scope-locked structure with v1.2.0 skin
   - No `bg-white` fills > 3%, clean hairline borders

5. **Chat Workspace (Dialogue Stream)**
   - Scope-locked structure with v1.2.0 typography & token skin
   - Opaque `#0B0B0B` reading background
   - No canvas bleed-through

6. **Memory Workspace (Knowledge Grid)**
   - Memory cards with subtle `#0E0E0E` interactive styling
   - Clean badges and 10-11px mono metadata

7. **Commands Workspace (Action Catalog & Launcher)**
   - Technical catalog with `#0B0B0B` plane
   - Macro editor with precise HUD styling

8. **Widgets Layer (Floating HUD widgets)**
   - `#0B0B0B` fill, 14px radius, top-left 2px accent bracket, no backdrop-filter over canvas
   - Unfocused widgets: opacity 0.60
