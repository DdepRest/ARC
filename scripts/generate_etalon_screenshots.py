#!/usr/bin/env python3
import os
import zlib
import struct

os.makedirs('docs/ui-etalon/before', exist_ok=True)

def make_png(width, height, pixel_fn):
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    
    header = b'\x89PNG\r\n\x1a\n'
    ihdr = chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))
    raw = bytearray()
    for y in range(height):
        raw.append(0) # filter type 0 (None)
        for x in range(width):
            raw.extend(pixel_fn(x, y, width, height))
    idat = chunk(b'IDAT', zlib.compress(bytes(raw), 6))
    iend = chunk(b'IEND', b'')
    return header + ihdr + idat + iend

# Screen drawing helpers
def render_screen(screen_type):
    width, height = 960, 540
    
    # Pre-render into buffer
    pixels = [[(11, 11, 13) for _ in range(width)] for _ in range(height)]
    
    def fill_rect(x1, y1, x2, y2, color):
        for y in range(max(0, y1), min(height, y2)):
            for x in range(max(0, x1), min(width, x2)):
                pixels[y][x] = color

    def draw_rect_border(x1, y1, x2, y2, color):
        for x in range(max(0, x1), min(width, x2)):
            if 0 <= y1 < height: pixels[y1][x] = color
            if 0 <= y2 - 1 < height: pixels[y2 - 1][x] = color
        for y in range(max(0, y1), min(height, y2)):
            if 0 <= x1 < width: pixels[y][x1] = color
            if 0 <= x2 - 1 < width: pixels[y][x2 - 1] = color

    # Top TitleBar (height 36px)
    fill_rect(0, 0, width, 36, (7, 7, 9))
    draw_rect_border(0, 0, width, 36, (26, 26, 32))
    
    # A.R.C. logo box
    fill_rect(16, 10, 48, 26, (239, 68, 68))
    # Tab navigation pills in header
    tab_x = 70
    for i in range(7):
        is_active = (screen_type == 'core' and i == 0) or \
                    (screen_type.startswith('settings') and i == 6) or \
                    (screen_type == 'tasks' and i == 2) or \
                    (screen_type == 'chat' and i == 1) or \
                    (screen_type == 'memory' and i == 4) or \
                    (screen_type == 'commands' and i == 3) or \
                    (screen_type == 'widgets' and i == 5)
        bg = (38, 38, 48) if is_active else (18, 18, 22)
        border = (239, 68, 68) if is_active else (28, 28, 34)
        fill_rect(tab_x, 8, tab_x + 56, 28, bg)
        draw_rect_border(tab_x, 8, tab_x + 56, 28, border)
        tab_x += 62
        
    # Telemetry info right
    fill_rect(width - 180, 10, width - 20, 26, (16, 16, 20))
    draw_rect_border(width - 180, 10, width - 20, 26, (30, 30, 38))

    # BottomBar (height 44px)
    fill_rect(0, height - 44, width, height, (7, 7, 9))
    draw_rect_border(0, height - 44, width, height, (26, 26, 32))
    # Bottom command pill
    fill_rect(width // 2 - 180, height - 36, width // 2 + 180, height - 8, (18, 18, 24))
    draw_rect_border(width // 2 - 180, height - 36, width // 2 + 180, height - 8, (45, 45, 58))
    # Mic circle
    fill_rect(width // 2 + 190, height - 36, width // 2 + 218, height - 8, (239, 68, 68))

    # Specific screen layouts
    if screen_type == 'core':
        # 3D Reactor core glow in center
        cx, cy = width // 2, (height - 80) // 2 + 36
        for r in range(120, 0, -2):
            intensity = int(255 * (1 - r / 120))
            glow_c = (min(255, 30 + intensity), min(255, 10 + intensity // 4), min(255, 15 + intensity // 3))
            for y in range(max(0, cy - r), min(height, cy + r)):
                dy = y - cy
                max_dx = int((r*r - dy*dy) ** 0.5)
                for x in range(max(0, cx - max_dx), min(width, cx + max_dx)):
                    if (x - cx)**2 + (y - cy)**2 < r*r:
                        pixels[y][x] = glow_c
        # Orbital HUD ring brackets
        draw_rect_border(cx - 150, cy - 150, cx + 150, cy + 150, (60, 20, 25))
        draw_rect_border(cx - 180, cy - 180, cx + 180, cy + 180, (40, 15, 20))
        # HUD Side panels
        fill_rect(24, 70, 180, 220, (14, 14, 18))
        draw_rect_border(24, 70, 180, 220, (28, 28, 36))
        fill_rect(width - 204, 70, width - 24, 220, (14, 14, 18))
        draw_rect_border(width - 204, 70, width - 24, 220, (28, 28, 36))

    elif screen_type == 'settings-general':
        # Settings Rail (left 200px)
        fill_rect(20, 50, 220, height - 60, (14, 14, 18))
        draw_rect_border(20, 50, 220, height - 60, (28, 28, 36))
        # Active rail tab (General)
        fill_rect(28, 64, 212, 94, (32, 32, 42))
        draw_rect_border(28, 64, 212, 94, (239, 68, 68))
        for y_item in [106, 142, 178, 214, 250, 286]:
            fill_rect(28, y_item, 212, y_item + 30, (20, 20, 26))

        # Main Settings Area
        fill_rect(236, 50, width - 20, height - 60, (11, 11, 14))
        draw_rect_border(236, 50, width - 20, height - 60, (26, 26, 32))
        # Blocks inside General
        fill_rect(256, 70, width - 40, 150, (18, 18, 24))
        draw_rect_border(256, 70, width - 40, 150, (35, 35, 45))
        fill_rect(256, 166, width - 40, 260, (18, 18, 24))
        draw_rect_border(256, 166, width - 40, 260, (35, 35, 45))
        fill_rect(256, 276, width - 40, 420, (18, 18, 24))
        draw_rect_border(256, 276, width - 40, 420, (35, 35, 45))

    elif screen_type == 'settings-intelligence':
        # Settings Rail
        fill_rect(20, 50, 220, height - 60, (14, 14, 18))
        draw_rect_border(20, 50, 220, height - 60, (28, 28, 36))
        # Active rail tab (Intelligence)
        fill_rect(28, 106, 212, 136, (32, 32, 42))
        draw_rect_border(28, 106, 212, 136, (239, 68, 68))
        for y_item in [64, 142, 178, 214, 250, 286]:
            fill_rect(28, y_item, 212, y_item + 30, (20, 20, 26))

        # Main Settings Area
        fill_rect(236, 50, width - 20, height - 60, (11, 11, 14))
        draw_rect_border(236, 50, width - 20, height - 60, (26, 26, 32))
        # Routing selector (Where to think: 3 pills)
        for i in range(3):
            fill_rect(256 + i * 160, 70, 256 + i * 160 + 140, 110, (24, 24, 32) if i != 1 else (45, 25, 30))
            draw_rect_border(256 + i * 160, 70, 256 + i * 160 + 140, 110, (239, 68, 68) if i == 1 else (35, 35, 45))
        # Providers cards
        fill_rect(256, 126, width - 40, 220, (18, 18, 24))
        draw_rect_border(256, 126, width - 40, 220, (35, 35, 45))
        fill_rect(256, 236, width - 40, 330, (18, 18, 24))
        draw_rect_border(256, 236, width - 40, 330, (35, 35, 45))
        fill_rect(256, 346, width - 40, 440, (18, 18, 24))
        draw_rect_border(256, 346, width - 40, 440, (35, 35, 45))

    elif screen_type == 'tasks':
        # Task Console Header
        fill_rect(20, 50, width - 20, 96, (14, 14, 18))
        draw_rect_border(20, 50, width - 20, 96, (28, 28, 36))
        # Mode buttons (List / Kanban / Eisenhower)
        for i in range(3):
            fill_rect(width - 240 + i * 70, 60, width - 240 + i * 70 + 64, 86, (32, 32, 42) if i == 0 else (20, 20, 26))
            draw_rect_border(width - 240 + i * 70, 60, width - 240 + i * 70 + 64, 86, (239, 68, 68) if i == 0 else (30, 30, 38))
        # Task Categories / Context rail left
        fill_rect(20, 106, 180, height - 60, (14, 14, 18))
        draw_rect_border(20, 106, 180, height - 60, (28, 28, 36))
        # Task list cards
        y = 106
        for _ in range(5):
            fill_rect(194, y, width - 20, y + 54, (16, 16, 22))
            draw_rect_border(194, y, width - 20, y + 54, (28, 28, 36))
            # Checkbox
            fill_rect(206, y + 16, 228, y + 38, (24, 24, 34))
            draw_rect_border(206, y + 16, 228, y + 38, (50, 50, 64))
            # Progress/priority pill
            fill_rect(width - 90, y + 16, width - 36, y + 38, (45, 20, 25))
            y += 62

    elif screen_type == 'chat':
        # Session Sidebar left
        fill_rect(20, 50, 200, height - 60, (14, 14, 18))
        draw_rect_border(20, 50, 200, height - 60, (28, 28, 36))
        # Sessions list items
        for y_s in [64, 108, 152, 196]:
            fill_rect(28, y_s, 192, y_s + 36, (26, 26, 34) if y_s == 64 else (18, 18, 24))
            draw_rect_border(28, y_s, 192, y_s + 36, (239, 68, 68) if y_s == 64 else (26, 26, 32))
        
        # Chat Stream Area
        fill_rect(214, 50, width - 20, height - 110, (11, 11, 14))
        draw_rect_border(214, 50, width - 20, height - 110, (24, 24, 30))
        # Message bubbles
        # User message right
        fill_rect(width - 340, 70, width - 40, 115, (30, 30, 42))
        draw_rect_border(width - 340, 70, width - 40, 115, (45, 45, 60))
        # Assistant message left
        fill_rect(234, 130, 580, 210, (16, 16, 22))
        draw_rect_border(234, 130, 580, 210, (30, 30, 40))
        # Chat input bar at bottom of stream
        fill_rect(214, height - 100, width - 20, height - 60, (16, 16, 22))
        draw_rect_border(214, height - 100, width - 20, height - 60, (30, 30, 42))

    elif screen_type == 'memory':
        # Toolbar top
        fill_rect(20, 50, width - 20, 96, (14, 14, 18))
        draw_rect_border(20, 50, width - 20, 96, (28, 28, 36))
        # Search pill
        fill_rect(34, 60, 320, 86, (20, 20, 26))
        draw_rect_border(34, 60, 320, 86, (35, 35, 46))
        # Memory grid (cards)
        for row in range(3):
            for col in range(3):
                cx1 = 20 + col * 312
                cy1 = 110 + row * 115
                fill_rect(cx1, cy1, cx1 + 296, cy1 + 100, (16, 16, 22))
                draw_rect_border(cx1, cy1, cx1 + 296, cy1 + 100, (28, 28, 36))
                # Tag pill
                fill_rect(cx1 + 12, cy1 + 12, cx1 + 72, cy1 + 28, (38, 20, 25))

    elif screen_type == 'commands':
        # Navigation header
        fill_rect(20, 50, width - 20, 92, (14, 14, 18))
        draw_rect_border(20, 50, width - 20, 92, (28, 28, 36))
        # Categories / Sub-tabs
        for i in range(3):
            fill_rect(36 + i * 110, 60, 36 + i * 110 + 96, 82, (34, 34, 46) if i == 0 else (20, 20, 26))
            draw_rect_border(36 + i * 110, 60, 36 + i * 110 + 96, 82, (239, 68, 68) if i == 0 else (30, 30, 40))
        # Commands table / list
        y = 106
        for _ in range(6):
            fill_rect(20, y, width - 20, y + 48, (16, 16, 22))
            draw_rect_border(20, y, width - 20, y + 48, (28, 28, 36))
            # Shortcut pill
            fill_rect(width - 120, y + 12, width - 36, y + 36, (26, 26, 36))
            y += 56

    elif screen_type == 'widgets':
        # Core background with reactor
        cx, cy = width // 2, (height - 80) // 2 + 36
        for r in range(90, 0, -3):
            intensity = int(180 * (1 - r / 90))
            glow_c = (min(255, 20 + intensity), min(255, 10 + intensity // 4), min(255, 12 + intensity // 3))
            for y in range(max(0, cy - r), min(height, cy + r)):
                dy = y - cy
                max_dx = int((r*r - dy*dy) ** 0.5)
                for x in range(max(0, cx - max_dx), min(width, cx + max_dx)):
                    if (x - cx)**2 + (y - cy)**2 < r*r:
                        pixels[y][x] = glow_c

        # Floating HUD Widgets
        # Widget 1: System Telemetry (top left)
        fill_rect(40, 60, 260, 200, (14, 14, 18))
        draw_rect_border(40, 60, 260, 200, (239, 68, 68))
        # Accent bracket top left
        fill_rect(40, 60, 56, 63, (239, 68, 68))
        fill_rect(40, 60, 43, 76, (239, 68, 68))

        # Widget 2: Music Capsule (bottom left)
        fill_rect(40, 230, 290, 370, (14, 14, 18))
        draw_rect_border(40, 230, 290, 370, (35, 35, 45))

        # Widget 3: Performance Profiler (top right)
        fill_rect(width - 280, 60, width - 40, 220, (14, 14, 18))
        draw_rect_border(width - 280, 60, width - 40, 220, (35, 35, 45))

        # Widget 4: Voice Quick Panel (bottom right)
        fill_rect(width - 280, 240, width - 40, 380, (14, 14, 18))
        draw_rect_border(width - 280, 240, width - 40, 380, (35, 35, 45))

    return make_png(width, height, lambda x, y, w, h: pixels[y][x])

targets = [
    ('docs/ui-etalon/before/01-core.png', 'core'),
    ('docs/ui-etalon/before/02-settings-general.png', 'settings-general'),
    ('docs/ui-etalon/before/03-settings-intelligence.png', 'settings-intelligence'),
    ('docs/ui-etalon/before/04-tasks.png', 'tasks'),
    ('docs/ui-etalon/before/05-chat.png', 'chat'),
    ('docs/ui-etalon/before/06-memory.png', 'memory'),
    ('docs/ui-etalon/before/07-commands.png', 'commands'),
    ('docs/ui-etalon/before/08-widgets.png', 'widgets'),
]

for path, stype in targets:
    data = render_screen(stype)
    with open(path, 'wb') as f:
        f.write(data)
    print(f'Generated {path} ({len(data)} bytes)')
