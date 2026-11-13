// ==UserScript==
// @name         A.R.C. VK Music Controller
// @namespace    http://tampermonkey.net/
// @version      1.1.6
// @description  Allows A.R.C. Desktop App to control VK Music via WebSocket
// @match        *://vk.com/*
// @match        *://vk.ru/*
// @match        *://*.vk.com/*
// @match        *://*.vk.ru/*
// @exclude      *://m.vk.com/*
// @run-at       document-start
// @noframes
// @grant        unsafeWindow
// ==/UserScript==

(function() {
    'use strict';

    // Fallback iframe guard
    if (window.top !== window.self) return;

    // ============================================================================
    // СЕКЦИЯ 1: КОНСТАНТЫ И ДИАГНОСТИКА
    // ============================================================================
    const PORT_SCAN_INTERVAL = 1800;
    const BG_IDLE_SCAN_INTERVAL = 5000;
    const INTRA_CYCLE_PORT_DELAY_MS = 300;
    const RECONNECT_BASE_DELAY = 1500;
    const CONNECT_TIMEOUT_MS = 3000;
    const HEARTBEAT_INTERVAL = 12000;
    const HEARTBEAT_PONG_TIMEOUT_MS = 5000;
    const SLEEP_WAKE_THRESHOLD_MS = 4500;
    const EXTERNAL_VOLUME_LOCKOUT_MS = 1200;
    const TRACK_CACHE_TTL = 60000;
    const COVER_WAIT_MS = 1800;
    const LIKE_DEBOUNCE_MS = 1000;
    const VOLUME_STEP = 0.1;
    const MAX_AUTOPLAY_ATTEMPTS = 10;
    const PORT_STORAGE_KEY = 'arc_vk_ws_port';
    const PLAYER_CONTAINER_SELECTOR = '[data-testid="AudioPage_PlayerBlock"], [data-testid="AudioPlayerBlock"], [data-testid="AudioPlayerBlock_LayoutGroups"], .top_audio_player, .audio_page_player2';

    const DEBUG = false;
    function log(...args) {
        if (DEBUG) console.log('[A.R.C. VK]', ...args);
    }

    let ws = null;
    const ports = [8765, 8766, 8767, 8768, 8769, 8770];
    let currentPortIndex = 0;
    let portsTriedInCurrentCycle = 0;
    try {
        const savedPort = parseInt(localStorage.getItem(PORT_STORAGE_KEY) || '', 10);
        const savedIdx = ports.indexOf(savedPort);
        if (savedIdx !== -1) currentPortIndex = savedIdx;
    } catch (e) {}

    let isConnecting = false;
    let hasEverConnected = false;
    let reconnectAttempts = 0;
    let reconnectTimer = null;
    let heartbeatTimer = null;
    let pongTimeoutTimer = null;
    let lastHeartbeatTickTime = Date.now();
    let lastPongReceivedTime = 0;
    let serverSupportsPong = false;
    let positionHeartbeatTimer = null;
    let lastPositionTickTime = Date.now();
    let observer = null;
    let cachedPlayBtn = null;

    let currentCommandId = null;
    let lastSentStatus = null;
    let lastLikeCommandTime = 0;
    let lastArcSetVolume = null;
    let lastArcSetVolumeTime = 0;
    let lastVolumeMethod = null;
    let isUserDraggingVolume = false;
    let userDragEndTime = 0;
    let lastUserDragPushTime = 0;

    log('Script v1.1.6 initialized');

    function sendCommandResult(command, success, reason) {
        if (currentCommandId === null) return;
        const cmdId = currentCommandId;
        currentCommandId = null;
        if (ws && ws.readyState === WebSocket.OPEN) {
            try {
                ws.send(JSON.stringify({
                    type: 'command_result',
                    id: cmdId,
                    command: command,
                    success: Boolean(success),
                    reason: reason || null,
                    timestamp: Date.now()
                }));
            } catch (e) {}
        }
    }

    // ============================================================================
    // СЕКЦИЯ 2: WEB-SOCKET СОЕДИНЕНИЕ, РЕКОННЕКТ И HEARTBEAT
    // ============================================================================
    function clearHeartbeat() {
        if (heartbeatTimer) {
            clearInterval(heartbeatTimer);
            heartbeatTimer = null;
        }
        if (pongTimeoutTimer) {
            clearTimeout(pongTimeoutTimer);
            pongTimeoutTimer = null;
        }
    }

    function forceReconnectSocket(reason) {
        log(`Forcing socket reconnect (${reason})`);
        clearHeartbeat();
        isConnecting = false;
        if (ws) {
            const oldWs = ws;
            ws = null;
            try {
                oldWs.onclose = null;
                oldWs.onerror = null;
                oldWs.onmessage = null;
                oldWs.onopen = null;
                oldWs.close();
            } catch (e) {}
        }
        if (reconnectTimer) {
            clearTimeout(reconnectTimer);
            reconnectTimer = null;
        }
        scheduleReconnect(100, false);
    }

    function scheduleReconnect(customDelay, isFullCycleCompleted = false) {
        if (reconnectTimer || isConnecting) return;
        let delay;
        if (typeof customDelay === 'number') {
            delay = customDelay;
        } else {
            const base = Math.min(RECONNECT_BASE_DELAY * Math.pow(1.5, reconnectAttempts), 30000);
            delay = Math.round(base + Math.random() * 500);
            if (isFullCycleCompleted) {
                reconnectAttempts++;
            }
        }
        reconnectTimer = setTimeout(() => {
            reconnectTimer = null;
            tryPort(currentPortIndex);
        }, delay);
    }

    function advancePortAndScheduleReconnect() {
        currentPortIndex = (currentPortIndex + 1) % ports.length;
        portsTriedInCurrentCycle++;
        if (portsTriedInCurrentCycle < ports.length) {
            scheduleReconnect(INTRA_CYCLE_PORT_DELAY_MS, false);
        } else {
            portsTriedInCurrentCycle = 0;
            scheduleReconnect(undefined, true);
        }
    }

    function tryPort(index) {
        if (isConnecting) return;
        if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return;

        isConnecting = true;
        const port = ports[index % ports.length];
        log(`Attempting connection on port ${port}...`);

        let connectTimeoutId = null;
        const clearConnectTimeout = () => {
            if (connectTimeoutId !== null) {
                clearTimeout(connectTimeoutId);
                connectTimeoutId = null;
            }
        };

        try {
            const myWs = new WebSocket(`ws://127.0.0.1:${port}`);
            ws = myWs;

            connectTimeoutId = setTimeout(() => {
                connectTimeoutId = null;
                if (myWs === ws && myWs.readyState === WebSocket.CONNECTING) {
                    log(`Connection timeout (${CONNECT_TIMEOUT_MS}ms) on port ${port}`);
                    isConnecting = false;
                    try {
                        myWs.close();
                    } catch (e) {}
                }
            }, CONNECT_TIMEOUT_MS);

            myWs.onopen = () => {
                clearConnectTimeout();
                if (myWs !== ws) return;
                isConnecting = false;
                hasEverConnected = true;
                reconnectAttempts = 0;
                portsTriedInCurrentCycle = 0;
                try {
                    localStorage.setItem(PORT_STORAGE_KEY, String(port));
                } catch (e) {}
                if (reconnectTimer) {
                    clearTimeout(reconnectTimer);
                    reconnectTimer = null;
                }
                log(`Connected on port ${port}`);
                lastSentStatus = null;
                lastHeartbeatTickTime = Date.now();
                lastPongReceivedTime = Date.now();
                sendStatus(true);
                setTimeout(() => sendStatus(true), 800);
                setTimeout(() => sendStatus(true), COVER_WAIT_MS);

                clearHeartbeat();
                heartbeatTimer = setInterval(() => {
                    const now = Date.now();
                    const delta = now - lastHeartbeatTickTime;
                    lastHeartbeatTickTime = now;

                    if (myWs !== ws || myWs.readyState !== WebSocket.OPEN) {
                        forceReconnectSocket('not_open_in_heartbeat');
                        return;
                    }

                    // Detect buffered backlog (half-open zombie socket)
                    if (typeof myWs.bufferedAmount === 'number' && myWs.bufferedAmount > 4096) {
                        forceReconnectSocket('buffered_backlog_overflow');
                        return;
                    }

                    // Detect system wake from sleep/hibernation
                    if (delta > HEARTBEAT_INTERVAL + SLEEP_WAKE_THRESHOLD_MS) {
                        log(`System wake detected (delta=${delta}ms), validating socket`);
                        scheduleStatusPush(true, 150);
                    }

                    try {
                        myWs.send(JSON.stringify({ type: 'ping', timestamp: now }));
                        if (serverSupportsPong) {
                            if (pongTimeoutTimer) clearTimeout(pongTimeoutTimer);
                            const pingSentAt = now;
                            pongTimeoutTimer = setTimeout(() => {
                                pongTimeoutTimer = null;
                                if (myWs === ws && lastPongReceivedTime < pingSentAt) {
                                    forceReconnectSocket('pong_timeout');
                                }
                            }, HEARTBEAT_PONG_TIMEOUT_MS);
                        }
                    } catch (e) {
                        forceReconnectSocket('ping_send_error');
                    }
                }, HEARTBEAT_INTERVAL);
            };

            myWs.onmessage = (event) => {
                if (myWs !== ws) return;
                let data;
                try {
                    data = JSON.parse(event.data);
                } catch (e) {
                    console.warn('[A.R.C. VK] Bad WS message:', e);
                    return;
                }
                if (!data) return;
                if (data.type === 'pong') {
                    serverSupportsPong = true;
                    lastPongReceivedTime = Date.now();
                    if (pongTimeoutTimer) {
                        clearTimeout(pongTimeoutTimer);
                        pongTimeoutTimer = null;
                    }
                    return;
                }
                if (typeof data.command !== 'string') return;
                currentCommandId = (data.id !== undefined && data.id !== null) ? data.id : null;
                handleCommand(data.command, data.data !== undefined ? data.data : data);
            };

            myWs.onclose = () => {
                clearConnectTimeout();
                if (myWs !== ws) return;
                isConnecting = false;
                clearHeartbeat();
                advancePortAndScheduleReconnect();
            };

            myWs.onerror = () => {
                clearConnectTimeout();
                if (myWs !== ws) return;
                isConnecting = false;
                clearHeartbeat();
                try {
                    myWs.close();
                } catch (e) {}
            };
        } catch (e) {
            clearConnectTimeout();
            isConnecting = false;
            clearHeartbeat();
            advancePortAndScheduleReconnect();
        }
    }

    function connect() {
        tryPort(currentPortIndex);
    }

    // ============================================================================
    // СЕКЦИЯ 3: ПЕРЕХВАТ AUDIO-ЭЛЕМЕНТОВ И VK AUDIO PLAYER API
    // ============================================================================
    const capturedAudios = new Set();
    const boundAudios = new WeakSet();
    let activeVkAudio = null;

    function registerCapturedAudio(aud) {
        if (!aud || typeof aud.play !== 'function') return;
        if (!capturedAudios.has(aud)) {
            capturedAudios.add(aud);
        }
        bindAudioEvents(aud);
        activeVkAudio = aud;
    }

    try {
        const winTarget = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        if (winTarget.HTMLMediaElement && winTarget.HTMLMediaElement.prototype) {
            const origPlay = winTarget.HTMLMediaElement.prototype.play;
            winTarget.HTMLMediaElement.prototype.play = function(...args) {
                registerCapturedAudio(this);
                return origPlay.apply(this, args);
            };
        }
        if (winTarget.Audio) {
            const OrigAudio = winTarget.Audio;
            winTarget.Audio = function(...args) {
                const inst = new OrigAudio(...args);
                registerCapturedAudio(inst);
                return inst;
            };
            winTarget.Audio.prototype = OrigAudio.prototype;
        }
    } catch (e) {}

    function getAllKnownAudios() {
        const domAudios = document.getElementsByTagName('audio');
        for (let i = 0; i < domAudios.length; i++) {
            registerCapturedAudio(domAudios[i]);
        }
        // Prune detached idle audio nodes when set grows large
        if (capturedAudios.size > 16) {
            for (const a of capturedAudios) {
                if (a !== activeVkAudio && a.paused && a.isConnected === false && !a.src) {
                    capturedAudios.delete(a);
                }
            }
        }
        return Array.from(capturedAudios);
    }

    function isSoundEffect(a) {
        if (!a) return true;
        // VK notification/UI sounds are typically 1-3s (e.g. 2.3s)
        if (typeof a.duration === 'number' && a.duration > 0 && a.duration < 5) return true;
        const src = (a.currentSrc || a.src || '').toLowerCase();
        if (src && (src.includes('bb2.mp3') || src.includes('mp3/bb') || src.includes('notify'))) return true;
        return false;
    }

    function getActiveAudio() {
        const all = getAllKnownAudios().filter(a => !isSoundEffect(a));
        // 1. Currently playing track with real progress or ready state
        const playing = all.find(a => !a.paused && a.readyState >= 2 && (a.duration > 5 || a.currentTime > 0)) ||
                        all.find(a => !a.paused && (a.duration > 10 || a.currentTime > 0));
        if (playing) {
            activeVkAudio = playing;
            return playing;
        }
        // 2. Last captured active VK audio if still valid
        if (activeVkAudio && !isSoundEffect(activeVkAudio) && (activeVkAudio.duration > 5 || activeVkAudio.currentTime > 0)) {
            return activeVkAudio;
        }
        // 3. Paused track that was partially played or has valid music duration
        return all.find(a => a.currentTime > 0 && a.duration > 5) ||
               all.find(a => a.duration > 10) ||
               all.find(a => a.currentTime > 0) ||
               all[0] ||
               null;
    }

    function getVkPlayer() {
        const win = typeof unsafeWindow !== 'undefined' ? unsafeWindow : window;
        const candidates = [
            () => (typeof unsafeWindow !== 'undefined' && unsafeWindow && typeof unsafeWindow.getAudioPlayer === 'function') ? unsafeWindow.getAudioPlayer() : null,
            () => (typeof window.getAudioPlayer === 'function') ? window.getAudioPlayer() : null,
            () => win.vkAudioPlayer || window.vkAudioPlayer,
            () => win.__vkPlayer || window.__vkPlayer,
            () => win.player || window.player,
            () => win.audioPlayer || window.audioPlayer
        ];
        for (let i = 0; i < candidates.length; i++) {
            try {
                const p = candidates[i]();
                if (p && typeof p.play === 'function' && typeof p.pause === 'function') {
                    return p;
                }
            } catch (e) {}
        }
        return null;
    }

    function isPlaying(aud, player) {
        if (player && typeof player.isPlaying === 'function') {
            try {
                if (player.isPlaying()) return true;
            } catch (e) {}
        }
        if (aud && !aud.paused && aud.readyState > 0) return true;
        if (navigator.mediaSession && navigator.mediaSession.playbackState === 'playing') return true;
        const root = document.querySelector(PLAYER_CONTAINER_SELECTOR) || document;
        return !!(
            root.querySelector('.top_audio_player_playing') ||
            root.querySelector('.AudioPlayerMini__play_playing') ||
            root.querySelector('[data-testid="audio-player-controls-state-button"][data-testactive="true"]') ||
            root.querySelector('[data-testid="AudioPlayerBlock_PlayButton"][data-teststate="playing"]') ||
            root.querySelector('[data-testid="AudioPlayerBlock_PlayButton"][aria-label*="Приостановить"]') ||
            root.querySelector('[data-testid="AudioPlayerBlock_PlayButton"][aria-label*="Пауз"]')
        );
    }

    // ============================================================================
    // СЕКЦИЯ 4: DOM-СЕЛЕКТОРЫ, КЛИКИ И УПРАВЛЕНИЕ ГРОМКОСТЬЮ / LIKE
    // ============================================================================
    function findInPlayer(selector, allowGlobalFallback = true) {
        const playerContainer = document.querySelector(PLAYER_CONTAINER_SELECTOR);
        if (playerContainer) {
            const found = playerContainer.querySelector(selector);
            if (found) return found;
        }
        return allowGlobalFallback ? document.querySelector(selector) : null;
    }

    function clickButton(selectors, allowGlobalFallback = true) {
        const list = Array.isArray(selectors) ? selectors : [selectors];
        const playerContainer = document.querySelector(PLAYER_CONTAINER_SELECTOR);
        for (const selector of list) {
            const btn = playerContainer
                ? (playerContainer.querySelector(selector) || (allowGlobalFallback ? document.querySelector(selector) : null))
                : (allowGlobalFallback ? document.querySelector(selector) : null);
            if (btn && btn.getBoundingClientRect().width > 0) {
                const targetBtn = btn.closest('button') || btn.closest('[role="button"]') || btn;
                targetBtn.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
                targetBtn.dispatchEvent(new MouseEvent('mouseup', { bubbles: true }));
                targetBtn.click();
                return targetBtn;
            }
        }
        return null;
    }

    function hasActiveSvgFill(btn) {
        if (!btn) return false;
        const paths = btn.querySelectorAll('svg path, svg use');
        for (const p of paths) {
            const fill = window.getComputedStyle(p).fill;
            if (!fill || fill === 'none' || fill === 'currentColor') continue;
            const m = fill.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
            if (m) {
                const r = parseInt(m[1], 10), g = parseInt(m[2], 10), b = parseInt(m[3], 10);
                if (r > 150 && g < 100 && b < 100) return true;
            }
        }
        return false;
    }

    function detectLikeActive(isTrackChanged = false, force = false) {
        const root = document.querySelector(PLAYER_CONTAINER_SELECTOR) || document;
        const likeBtn = root.querySelector('[data-testid="AudioPlayerBlock_ToggleOwning"]') ||
                        root.querySelector('[data-testid="MusicAudio_ToggleOwning"]') ||
                        root.querySelector('[data-testid="ToggleOwning"]') ||
                        root.querySelector('.top_audio_player_btn_add');

        const addBtn = document.querySelector('.audio_row_playing .audio_row__action_add');
        const deleteBtn = document.querySelector('.audio_row_playing .audio_row__action_delete');
        const isDeleteVisible = Boolean(deleteBtn && deleteBtn.getBoundingClientRect().width > 0);
        const isAddVisible = Boolean(addBtn && addBtn.getBoundingClientRect().width > 0);

        let result = false;
        if (isDeleteVisible) {
            result = true;
        } else if (likeBtn) {
            const ariaLabel = (likeBtn.getAttribute('aria-label') || likeBtn.getAttribute('title') || '').toLowerCase();
            const textContent = (likeBtn.textContent || '').toLowerCase();
            if (
                likeBtn.getAttribute('data-testactive') === 'true' ||
                likeBtn.getAttribute('data-teststate') === 'active' ||
                likeBtn.getAttribute('data-teststate') === 'added' ||
                likeBtn.getAttribute('aria-checked') === 'true' ||
                ariaLabel.includes('удалить') ||
                ariaLabel.includes('добавлено') ||
                textContent.includes('удалить') ||
                textContent.includes('добавлено') ||
                likeBtn.classList.contains('audio_row__action_add_active') ||
                likeBtn.classList.contains('audio_row__action_delete') ||
                likeBtn.classList.contains('top_audio_player_btn_added')
            ) {
                result = true;
            } else if (
                likeBtn.getAttribute('data-testactive') === 'false' ||
                ariaLabel.includes('добавить') ||
                textContent.includes('добавить')
            ) {
                result = false;
            } else {
                result = hasActiveSvgFill(likeBtn);
            }
        } else if (isAddVisible) {
            result = false;
        }

        return result;
    }

    function clickLikeButton(mode) {
        if (mode === 'save') {
            const addRowBtn = document.querySelector('.audio_row_playing .audio_row__action_add');
            if (addRowBtn && addRowBtn.getBoundingClientRect().width > 0) {
                addRowBtn.click();
                return true;
            }
        } else if (mode === 'remove') {
            const delRowBtn = document.querySelector('.audio_row_playing .audio_row__action_delete');
            if (delRowBtn && delRowBtn.getBoundingClientRect().width > 0) {
                delRowBtn.click();
                return true;
            }
        }

        const specificSelector = mode === 'save'
            ? '[data-testid="AudioPlayerBlock_ToggleOwning"][data-testactive="false"], [data-testid="MusicAudio_ToggleOwning"][data-testactive="false"], [data-testid="ToggleOwning"][data-testactive="false"], [data-testid="AudioPlayerBlock_ToggleOwning"], [data-testid="MusicAudio_ToggleOwning"], .top_audio_player_btn_add:not(.active)'
            : mode === 'remove'
                ? '[data-testid="AudioPlayerBlock_ToggleOwning"][data-testactive="true"], [data-testid="MusicAudio_ToggleOwning"][data-testactive="true"], [data-testid="ToggleOwning"][data-testactive="true"], .top_audio_player_btn_add.active, .top_audio_player_btn_add.top_audio_player_btn_added'
                : '[data-testid="AudioPlayerBlock_ToggleOwning"], [data-testid="MusicAudio_ToggleOwning"], [data-testid="ToggleOwning"], .top_audio_player_btn_add';

        const fallbackToggleSelector = '[data-testid="AudioPlayerBlock_ToggleOwning"], [data-testid="MusicAudio_ToggleOwning"], [data-testid="ToggleOwning"], [data-testid*="ToggleOwning"], .top_audio_player_btn_add';
        return Boolean(clickButton([specificSelector, fallbackToggleSelector], false) || clickButton([specificSelector, fallbackToggleSelector], true));
    }

    function findVkVolumeSlider() {
        const vkitSlider = document.querySelector('[data-testid="audioplayervolumeslider-bar-slider"]');
        if (vkitSlider) return vkitSlider;

        const playerRoot = document.querySelector(PLAYER_CONTAINER_SELECTOR) || document.querySelector('[data-testid*="AudioPlayer"], [data-testid*="audio-player"], [data-testid*="audioplayer" i]');
        const scope = playerRoot || document;
        const direct = scope.querySelector('[data-testid="audioplayervolumeslider-bar-slider"]') ||
                       scope.querySelector('[data-testid="AudioPlayerBlock_VolumeSlider"]') ||
                       scope.querySelector('[data-testid="audio-player-controls-volume-slider"]') ||
                       scope.querySelector('[data-testid="AudioPlayerBlock_Volume"] [role="slider"]') ||
                       scope.querySelector('[data-testid*="volumeslider" i][role="slider"]') ||
                       scope.querySelector('[data-testid*="volume" i][role="slider"]') ||
                       scope.querySelector('[data-testid*="volume" i] [role="slider"]') ||
                       scope.querySelector('[data-testid*="VolumeSlider" i]') ||
                       scope.querySelector('[data-testid*="volume-slider" i]') ||
                       scope.querySelector('.top_audio_player_volume') ||
                       scope.querySelector('.audio_page_player_volume_slider');
        if (direct) return direct;

        if (playerRoot) {
            const sliders = playerRoot.querySelectorAll('[role="slider"], input[type="range"]');
            for (let i = 0; i < sliders.length; i++) {
                const s = sliders[i];
                const tid = (s.getAttribute('data-testid') || (s.parentElement && s.parentElement.getAttribute('data-testid')) || '').toLowerCase();
                if (tid.includes('progress') || tid.includes('track') || tid.includes('time')) continue;
                const r = s.getBoundingClientRect();
                if (r.width >= 30 && r.width <= 160) return s;
            }
        }
        return null;
    }

    function readVkSliderVolume(volSlider) {
        if (!volSlider) return null;

        // 1. ARIA role="slider" attributes (handles both 0..1 and 0..100 scales)
        const sliderRoleEl = volSlider.getAttribute('role') === 'slider' ? volSlider : (volSlider.querySelector('[role="slider"]') || volSlider);
        const ariaNow = sliderRoleEl.getAttribute('aria-valuenow') ?? volSlider.getAttribute('aria-valuenow');
        if (ariaNow !== null && ariaNow !== '') {
            const numNow = parseFloat(ariaNow);
            if (Number.isFinite(numNow)) {
                return numNow > 1 ? Math.min(1, Math.max(0, numNow / 100)) : Math.min(1, Math.max(0, numNow));
            }
        }

        // 2. Hidden vkit slider_input (<input type="hidden" name="slider" data-testid="slider_input" value="49.00000000000001">)
        const hiddenSliderInput = volSlider.querySelector('input[data-testid="slider_input"], input[name="slider"]');
        if (hiddenSliderInput && hiddenSliderInput.value !== undefined && hiddenSliderInput.value !== '') {
            const val = parseFloat(hiddenSliderInput.value);
            if (Number.isFinite(val)) {
                return val > 1 ? Math.min(1, Math.max(0, val / 100)) : Math.min(1, Math.max(0, val));
            }
        }

        // 3. Standard input[type="range"]
        const rangeInput = volSlider.tagName === 'INPUT' ? volSlider : volSlider.querySelector('input[type="range"]');
        if (rangeInput && rangeInput.value !== undefined && rangeInput.value !== '') {
            const val = parseFloat(rangeInput.value);
            const max = parseFloat(rangeInput.max || '100') || (val > 1 ? 100 : 1);
            if (Number.isFinite(val) && max > 0) {
                return Math.min(1, Math.max(0, val / max));
            }
        }

        // 4. Visual fill bar width% (read-only fallback)
        const fillEl = volSlider.querySelector('[style*="width"]') || (volSlider.style && volSlider.style.width ? volSlider : null);
        if (fillEl && fillEl.style && fillEl.style.width && fillEl.style.width.endsWith('%')) {
            const pct = parseFloat(fillEl.style.width);
            if (Number.isFinite(pct)) {
                return Math.min(1, Math.max(0, pct / 100));
            }
        }

        return null;
    }

    function updateVkVolumeVisualProgress(sliderEl, rawAriaVal) {
        if (!sliderEl) return false;
        try {
            const ariaVal = rawAriaVal !== undefined ? rawAriaVal : sliderEl.getAttribute('aria-valuenow');
            let pct;
            if (ariaVal !== null && ariaVal !== '') {
                const numVal = parseFloat(ariaVal);
                if (Number.isFinite(numVal)) {
                    pct = numVal > 1 ? Math.min(100, Math.max(0, numVal)) : Math.min(100, Math.max(0, numVal * 100));
                }
            }
            if (pct === undefined) {
                if (typeof lastArcSetVolume === 'number' && Number.isFinite(lastArcSetVolume)) {
                    pct = Math.min(100, Math.max(0, lastArcSetVolume * 100));
                } else {
                    return false;
                }
            }

            const pctStr = pct.toFixed(4) + '%';
            const numStr = pct.toFixed(4);

            // 1. VK Modern vkit Player Block ([data-testid="audioplayervolumeslider-bar-slider"])
            const vkitBar = sliderEl.querySelector('[data-testid="audioplayervolumeslider-bar"]') ||
                            (sliderEl.getAttribute('data-testid') === 'audioplayervolumeslider-bar' ? sliderEl : null) ||
                            (sliderEl.getAttribute('data-testid') === 'audioplayervolumeslider-bar-slider' ? sliderEl : null) ||
                            sliderEl.querySelector('.vkit-bA45kR');

            if (vkitBar || (sliderEl.getAttribute('data-testid') || '').includes('audioplayervolumeslider')) {
                const root = vkitBar || sliderEl;
                const fillEl = root.querySelector('.vkit-G4t2iz') ||
                               root.querySelector('.vkit-jsKPUN:not(.vkit-Y4f73C)');
                if (fillEl && fillEl.style && fillEl.style.width !== pctStr) {
                    fillEl.style.width = pctStr;
                }

                const thumbEl = root.querySelector('.vkit-Y4f73C');
                if (thumbEl && thumbEl.style && thumbEl.style.left !== pctStr) {
                    thumbEl.style.left = pctStr;
                }

                try {
                    root.style.setProperty('--vkui_internal--slider-progress', pctStr);
                    root.style.setProperty('--vkui_internal--slider-thumb-left', pctStr);
                } catch (e) {}

                const hiddenInput = root.querySelector('input[data-testid="slider_input"], input[name="slider"]');
                if (hiddenInput && hiddenInput.value !== numStr) {
                    hiddenInput.value = numStr;
                }
            }

            // 2. VK Classic Top Player (.top_audio_player_volume / .audio_page_player_volume_slider)
            const topVol = sliderEl.classList && sliderEl.classList.contains('top_audio_player_volume')
                ? sliderEl
                : (sliderEl.querySelector ? sliderEl.querySelector('.top_audio_player_volume') : null);

            if (topVol) {
                const progressEl = topVol.querySelector('.top_audio_player_volume_progress') ||
                                   topVol.querySelector('.ui_slider_amount') ||
                                   topVol.querySelector('.ui_slider_amount_back');
                if (progressEl && progressEl.style && progressEl.style.width !== pctStr) {
                    progressEl.style.width = pctStr;
                }

                const thumbEl = topVol.querySelector('.top_audio_player_volume_thumb') ||
                                topVol.querySelector('.ui_slider_thumb');
                if (thumbEl && thumbEl.style && thumbEl.style.left !== pctStr) {
                    thumbEl.style.left = pctStr;
                }
            }

            // 3. Standard input[type="range"] inside sliderEl ONLY
            const rangeInput = sliderEl.tagName === 'INPUT' ? sliderEl : (sliderEl.querySelector ? sliderEl.querySelector('input[type="range"]') : null);
            if (rangeInput && rangeInput.value !== String(pct)) {
                rangeInput.value = String(pct);
            }

            return true;
        } catch (e) {
            return false;
        }
    }

    let volumeSliderObserver = null;
    let observedVolumeSliderEl = null;

    function bindVolumeSliderObserver() {
        const sliderEl = document.querySelector('[data-testid="audioplayervolumeslider-bar-slider"]') ||
                         document.querySelector('[data-testid="audioplayervolumeslider-bar"]') ||
                         document.querySelector('.top_audio_player_volume [role="slider"]') ||
                         document.querySelector('.top_audio_player_volume');
        if (!sliderEl) {
            if (observedVolumeSliderEl && (!document.body || !document.body.contains(observedVolumeSliderEl))) {
                if (volumeSliderObserver) {
                    try { volumeSliderObserver.disconnect(); } catch (e) {}
                    volumeSliderObserver = null;
                }
                observedVolumeSliderEl = null;
            }
            return;
        }
        if (observedVolumeSliderEl === sliderEl && document.body && document.body.contains(observedVolumeSliderEl) && volumeSliderObserver) {
            return;
        }

        if (volumeSliderObserver) {
            try { volumeSliderObserver.disconnect(); } catch (e) {}
            volumeSliderObserver = null;
        }

        observedVolumeSliderEl = sliderEl;
        volumeSliderObserver = new MutationObserver((mutations) => {
            for (let i = 0; i < mutations.length; i++) {
                const mutation = mutations[i];
                if (mutation.type === 'attributes' && mutation.attributeName === 'aria-valuenow') {
                    const targetEl = mutation.target;
                    const slider = (targetEl.closest && targetEl.closest('[data-testid="audioplayervolumeslider-bar-slider"]')) ||
                                   (targetEl.closest && targetEl.closest('.top_audio_player_volume')) ||
                                   targetEl;
                    updateVkVolumeVisualProgress(slider);
                }
            }
        });

        volumeSliderObserver.observe(sliderEl, {
            attributes: true,
            subtree: true,
            attributeFilter: ['aria-valuenow']
        });

        if (typeof lastArcSetVolume === 'number' && Number.isFinite(lastArcSetVolume) && !isUserDraggingVolume) {
            updateVkVolumeVisualProgress(sliderEl, (lastArcSetVolume * 100).toFixed(4));
        } else {
            updateVkVolumeVisualProgress(sliderEl);
        }
    }

    function updateVkVolumeSliderVisual(val) {
        if (typeof val !== 'number' || !Number.isFinite(val)) return false;
        const normalized = Math.min(1, Math.max(0, val));
        const pct = normalized * 100;
        const numStr = pct.toFixed(4);

        const slider = findVkVolumeSlider();
        if (!slider) return false;

        bindVolumeSliderObserver();

        function applyDomStyles() {
            try {
                if (isUserDraggingVolume) return;
                // If slider specifies aria-valuemax="1", set 0..1 scale (e.g. 0.3400), else 0..100 (e.g. 34.0000)
                const isMaxOne = slider.getAttribute('aria-valuemax') === '1';
                const ariaValToSet = isMaxOne ? normalized.toFixed(4) : numStr;

                slider.setAttribute('aria-valuenow', ariaValToSet);
                const roleEl = slider.getAttribute('role') === 'slider' ? slider : (slider.querySelector ? slider.querySelector('[role="slider"]') : null);
                if (roleEl && roleEl !== slider) {
                    const roleIsMaxOne = roleEl.getAttribute('aria-valuemax') === '1';
                    roleEl.setAttribute('aria-valuenow', roleIsMaxOne ? normalized.toFixed(4) : numStr);
                }

                updateVkVolumeVisualProgress(slider, numStr);
            } catch (e) {}
        }

        applyDomStyles();
        setTimeout(applyDomStyles, 40);
        setTimeout(applyDomStyles, 120);
        return true;
    }

    function detectVkVolume(_player) {
        const activeAud = getActiveAudio();
        if (activeAud && activeAud.muted) return 0;

        // 1. Защитное окно подавления пинг-понга (1200 мс) сразу после установки громкости из A.R.C.
        if (!isUserDraggingVolume && lastArcSetVolume !== null && typeof lastArcSetVolume === 'number' && (Date.now() - lastArcSetVolumeTime < EXTERNAL_VOLUME_LOCKOUT_MS)) {
            return lastArcSetVolume;
        }

        // 2. DOM-слайдер VK
        const volSlider = findVkVolumeSlider();
        const sliderVol = readVkSliderVolume(volSlider);
        if (sliderVol !== null && Number.isFinite(sliderVol) && sliderVol >= 0 && sliderVol <= 1) {
            return sliderVol;
        }

        // 3. Кубический корень из громкости HTML5 <audio> (slider = Math.cbrt(aud.volume))
        if (activeAud && typeof activeAud.volume === 'number' && Number.isFinite(activeAud.volume)) {
            return Math.min(1, Math.max(0, Math.cbrt(activeAud.volume)));
        }

        // 4. Сохранённое значение сессии, если DOM-слайдер отсутствует на текущей странице SPA
        if (lastArcSetVolume !== null && typeof lastArcSetVolume === 'number') {
            return lastArcSetVolume;
        }

        return 0.5;
    }

    function getCurrentVolume(aud, player) {
        return detectVkVolume(player);
    }

    function applyVolumeValue(rawVal, aud, player) {
        // Не перебиваем активное ручное перетаскивание ползунка пользователем в браузере
        if (isUserDraggingVolume || (Date.now() - userDragEndTime < 250)) {
            return false;
        }

        let val = (typeof rawVal === 'number' && Number.isFinite(rawVal)) ? rawVal : 0.5;
        if (val > 1) val = val / 100;
        val = Math.min(1, Math.max(0, val));

        lastArcSetVolume = val;
        lastArcSetVolumeTime = Date.now();

        const gain = Math.pow(val, 3);

        if (player && typeof player.setVolume === 'function') {
            try {
                player.setVolume(gain);
            } catch (e) {}
        }

        // 1. HTML5 audio: устанавливаем кубический gain (val^3)
        for (const a of getAllKnownAudios()) {
            if (a && !isSoundEffect(a)) {
                try {
                    a.volume = gain;
                    a.muted = (val === 0);
                } catch(e) {}
            }
        }

        // 2. Визуальное перемещение ползунка в DOM VK (стили fill/thumb/ARIA/input)
        updateVkVolumeSliderVisual(val);

        try {
            if (localStorage.getItem('audio_v20_vol') !== null) localStorage.setItem('audio_v20_vol', String(gain));
            if (localStorage.getItem('audio_vol') !== null) localStorage.setItem('audio_vol', String(gain));
        } catch (e) {}

        lastVolumeMethod = 'dom';
        setTimeout(() => scheduleStatusPush(true, 0), 220);
        return true;
    }

    // ============================================================================
    // СЕКЦИЯ 5: ОБРАБОТКА КОМАНД И ЗАЩИТА АВТОПЛЕЯ
    // ============================================================================
    let statusDebounceTimer = null;
    function scheduleStatusPush(force = false, delayMs = 120) {
        if (statusDebounceTimer) clearTimeout(statusDebounceTimer);
        statusDebounceTimer = setTimeout(() => {
            statusDebounceTimer = null;
            sendStatus(force);
        }, delayMs);
    }

    const PLAY_SELECTORS = [
        '[data-testid="AudioPlayerBlock_PlayButton"][aria-label*="Воспроизвести"]',
        '[data-testid="AudioPlayerBlock_PlayButton"][data-teststate="paused"]',
        '[data-testid="audio-player-controls-state-button"][data-testactive="false"]',
        '.top_audio_player_play:not(.top_audio_player_playing)',
        'button[aria-label="Воспроизвести"]',
        'button[aria-label*="Воспроизвести"]',
        '.AudioPlayerMini__play:not(.AudioPlayerMini__play_playing)',
        '.audio_row_current:not(.audio_row_playing) .audio_row__play_btn',
        '.audio_page_player_play:not(.audio_page_player_playing)'
    ];

    const PAUSE_SELECTORS = [
        '[data-testid="AudioPlayerBlock_PlayButton"][aria-label*="Приостановить"]',
        '[data-testid="AudioPlayerBlock_PlayButton"][aria-label*="Пауз"]',
        '[data-testid="AudioPlayerBlock_PlayButton"][data-teststate="playing"]',
        '[data-testid="audio-player-controls-state-button"][data-testactive="true"]',
        '.top_audio_player_play.top_audio_player_playing',
        'button[aria-label="Пауза"]',
        'button[aria-label*="Приостановить"]',
        'button[aria-label*="Пауз"]',
        '.pause-btn',
        '.AudioPlayerMini__play_playing',
        '.audio_row_playing .audio_row__play_btn'
    ];

    function triggerDomPlayFallback(player) {
        if (cachedPlayBtn && document.contains(cachedPlayBtn) && cachedPlayBtn.getBoundingClientRect().width > 0) {
            const stateAttr = cachedPlayBtn.getAttribute('data-teststate');
            const activeAttr = cachedPlayBtn.getAttribute('data-testactive');
            const ariaAttr = cachedPlayBtn.getAttribute('aria-label') || '';
            if (stateAttr !== 'playing' && activeAttr !== 'true' && !ariaAttr.includes('Приостановить') && !ariaAttr.includes('Пауз')) {
                cachedPlayBtn.click();
                return true;
            }
            cachedPlayBtn = null;
        }
        const clicked = clickButton(PLAY_SELECTORS);
        if (clicked) {
            cachedPlayBtn = clicked;
            return true;
        }
        if (player && typeof player.play === 'function' && (!player.isPlaying || !player.isPlaying())) {
            try {
                player.play();
                return true;
            } catch (e) {}
        }
        return false;
    }

    function handleCommand(command, data) {
        let success = false;
        if (!command || typeof command !== 'string') return false;

        if (command === 'sync' || command === 'get_status') {
            lastSentStatus = null;
            sendStatus(true);
            sendCommandResult(command, true, 'api');
            return true;
        }

        if (command === 'ping') {
            sendCommandResult('ping', true, 'api');
            return true;
        }

        const player = getVkPlayer();
        const aud = getActiveAudio();

        if (command === 'play' || (command === 'toggle' && !isPlaying(aud, player))) {
            // 1. API-first
            if (player && typeof player.play === 'function') {
                try {
                    player.play();
                    log('[A.R.C.] play via API');
                    sendCommandResult('play', true, 'api');
                    scheduleStatusPush(true, 150);
                    return true;
                } catch (e) { /* fallback ниже */ }
            }

            try {
                if (document.body) {
                    const ev = new MouseEvent('mousedown', { bubbles: true, cancelable: true, view: window });
                    document.body.dispatchEvent(ev);
                }
            } catch (e) {}

            // 2. DOM / HTML5 Audio fallback
            if (aud && aud.paused && aud.src) {
                aud.play().then(() => {
                    log('[A.R.C.] play via DOM');
                    sendCommandResult('play', true, 'dom');
                    scheduleStatusPush(true, 150);
                }).catch((err) => {
                    if (err && err.name === 'NotAllowedError') {
                        console.warn('[A.R.C. VK] Autoplay blocked by browser policy');
                        sendCommandResult('play', false, 'autoplay_blocked');
                    } else {
                        const fallbackOk = triggerDomPlayFallback(player);
                        if (fallbackOk) {
                            log('[A.R.C.] play via DOM');
                            sendCommandResult('play', true, 'dom');
                            scheduleStatusPush(true, 180);
                        } else {
                            sendCommandResult('play', false, 'api+dom_failed');
                        }
                    }
                });
                return true;
            } else {
                success = triggerDomPlayFallback(player);
                if (success) {
                    log('[A.R.C.] play via DOM');
                    sendCommandResult('play', true, 'dom');
                } else {
                    sendCommandResult('play', false, 'api+dom_failed');
                }
            }
        } else if (command === 'pause' || (command === 'toggle' && isPlaying(aud, player))) {
            // 1. API-first
            if (player && typeof player.pause === 'function') {
                try {
                    player.pause();
                    log('[A.R.C.] pause via API');
                    sendCommandResult('pause', true, 'api');
                    scheduleStatusPush(true, 150);
                    return true;
                } catch (e) { /* fallback ниже */ }
            }

            // 2. DOM / HTML5 Audio fallback
            if (aud && !aud.paused) {
                try {
                    aud.pause();
                    success = true;
                } catch (e) {}
            }
            if (!success) {
                success = Boolean(clickButton(PAUSE_SELECTORS));
            }
            if (success) {
                log('[A.R.C.] pause via DOM');
                sendCommandResult('pause', true, 'dom');
            } else {
                sendCommandResult('pause', false, 'api+dom_failed');
            }
        } else if (command === 'next') {
            // 1. API-first
            if (player && typeof player.playNext === 'function') {
                try {
                    player.playNext();
                    log('[A.R.C.] next via API');
                    sendCommandResult('next', true, 'api');
                    setTimeout(() => sendStatus(true), 150);
                    setTimeout(() => sendStatus(true), 600);
                    return true;
                } catch (e) { /* fallback ниже */ }
            }

            // 2. DOM fallback
            const clicked = clickButton([
                '[data-testid="AudioPlayerBlock_NextButton"]',
                '[data-testid="audio-player-controls-forward-button"]',
                '.top_audio_player_next',
                'button[aria-label*="Следующий"]',
                '.AudioPlayerMini__next'
            ]);
            if (clicked) {
                success = true;
                log('[A.R.C.] next via DOM');
                sendCommandResult('next', true, 'dom');
            } else {
                sendCommandResult('next', false, 'api+dom_failed');
            }
            setTimeout(() => sendStatus(true), 150);
            setTimeout(() => sendStatus(true), 600);
        } else if (command === 'prev') {
            // 1. API-first
            if (player && typeof player.playPrev === 'function') {
                try {
                    player.playPrev();
                    log('[A.R.C.] prev via API');
                    sendCommandResult('prev', true, 'api');
                    setTimeout(() => sendStatus(true), 150);
                    setTimeout(() => sendStatus(true), 600);
                    return true;
                } catch (e) { /* fallback ниже */ }
            }

            // 2. DOM fallback
            const clicked = clickButton([
                '[data-testid="AudioPlayerBlock_PrevButton"]',
                '[data-testid="audio-player-controls-backward-button"]',
                '.top_audio_player_prev',
                'button[aria-label*="Предыдущий"]',
                '.AudioPlayerMini__prev'
            ]);
            if (clicked) {
                success = true;
                log('[A.R.C.] prev via DOM');
                sendCommandResult('prev', true, 'dom');
            } else {
                sendCommandResult('prev', false, 'api+dom_failed');
            }
            setTimeout(() => sendStatus(true), 150);
            setTimeout(() => sendStatus(true), 600);
        } else if (command === 'shuffle') {
            // 1. API-first
            if (player && typeof player.toggleShuffle === 'function') {
                try {
                    player.toggleShuffle();
                    log('[A.R.C.] shuffle via API');
                    sendCommandResult('shuffle', true, 'api');
                    scheduleStatusPush(true, 180);
                    return true;
                } catch (e) { /* fallback ниже */ }
            }

            // 2. DOM fallback
            const clicked = clickButton([
                '[data-testid="AudioPlayerBlock_ShuffleSwitcher"]',
                '[data-testid="ToggleShuffled"]',
                '[data-testid="audio-player-controls-shuffle-button"]',
                '.top_audio_player_btn_shuffle',
                '[data-testid="MusicAudio_Shuffle"]',
                '[data-testid="MusicPlayer_Shuffle"]'
            ]);
            if (clicked) {
                success = true;
                log('[A.R.C.] shuffle via DOM');
                sendCommandResult('shuffle', true, 'dom');
            } else {
                sendCommandResult('shuffle', false, 'api+dom_failed');
            }
        } else if (command === 'repeat') {
            // 1. API-first
            if (player && typeof player.toggleRepeat === 'function') {
                try {
                    player.toggleRepeat();
                    log('[A.R.C.] repeat via API');
                    sendCommandResult('repeat', true, 'api');
                    scheduleStatusPush(true, 180);
                    return true;
                } catch (e) { /* fallback ниже */ }
            }

            // 2. DOM fallback
            const clicked = clickButton([
                '[data-testid="AudioPlayerBlock_RepeatSwitcher"]',
                '[data-testid="RepeatSwitcher"]',
                '[data-testid="audio-player-controls-repeat-button"]',
                '.top_audio_player_btn_repeat'
            ]);
            if (clicked) {
                success = true;
                log('[A.R.C.] repeat via DOM');
                sendCommandResult('repeat', true, 'dom');
            } else {
                sendCommandResult('repeat', false, 'api+dom_failed');
            }
        } else if (command === 'like' || command === 'save' || command === 'remove') {
            if (Date.now() - lastLikeCommandTime < LIKE_DEBOUNCE_MS) {
                sendCommandResult(command, false, 'not_found');
                return false;
            }
            lastLikeCommandTime = Date.now();
            success = clickLikeButton(command);
            if (success) {
                log('[A.R.C.] like via DOM');
                sendCommandResult(command, true, 'dom');
            } else {
                sendCommandResult(command, false, 'not_found');
            }
        } else if (command === 'rewind_fwd' || command === 'rewind_back' || command === 'seek') {
            let ct = 0;
            let duration = 0;
            const track = (player && player.getCurrentAudio) ? player.getCurrentAudio() : null;
            if (aud) {
                ct = aud.currentTime || 0;
                duration = aud.duration || 0;
            }
            if ((ct === 0 || duration === 0) && player) {
                const stats = player.getStats ? player.getStats() : null;
                ct = (stats && typeof stats[2] === 'number') ? stats[2] : ct;
                duration = track ? (track[5] || duration) : duration;
            }

            const rawPct = data && data.percentage;
            const percentage = (typeof rawPct === 'number' && Number.isFinite(rawPct))
                ? Math.min(100, Math.max(0, rawPct))
                : null;

            let usedMethod = null;
            if (duration > 0) {
                let target = ct;
                if (command === 'rewind_fwd') target = ct + 10;
                else if (command === 'rewind_back') target = ct - 10;
                else if (command === 'seek' && percentage !== null) target = duration * (percentage / 100);
                target = Math.max(0, Math.min(duration - 0.5, target));

                for (const a of getAllKnownAudios()) {
                    if (a && (!isSoundEffect(a) || !a.duration)) {
                        try {
                            a.currentTime = target;
                            a.dispatchEvent(new Event('timeupdate'));
                            a.dispatchEvent(new Event('seeked'));
                            success = true;
                            if (!usedMethod) usedMethod = 'dom';
                        } catch(e) {}
                    }
                }
            }

            sendCommandResult(command, success, success ? (usedMethod || 'dom') : 'api+dom_failed');
        } else if (command === 'volume_up' || command === 'volume_down') {
            const currentVol = getCurrentVolume(aud, player);
            const newVol = command === 'volume_up'
                ? Math.min(1, currentVol + VOLUME_STEP)
                : Math.max(0, currentVol - VOLUME_STEP);
            success = applyVolumeValue(newVol, aud, player);
            if (success) {
                sendCommandResult(command, true, lastVolumeMethod === 'api' ? 'api' : 'dom');
            } else {
                sendCommandResult(command, false, 'api+dom_failed');
            }
            return success;
        } else if (command === 'volume' || command === 'set_volume') {
            const rawVal = (data && typeof data.value === 'number')
                ? data.value
                : (data && typeof data.volume === 'number' ? data.volume : 0.5);
            success = applyVolumeValue(rawVal, aud, player);
            if (success) {
                sendCommandResult(command, true, lastVolumeMethod === 'api' ? 'api' : 'dom');
            } else {
                sendCommandResult(command, false, 'api+dom_failed');
            }
            return success;
        } else {
            console.warn('[A.R.C. VK] Unknown command:', command);
            sendCommandResult(command, false, 'not_found');
            return false;
        }

        if (success) scheduleStatusPush(true, 180);
        return success;
    }

    // ============================================================================
    // СЕКЦИЯ 6: ПАРСИНГ МЕТАДАННЫХ ТРЕКА, КЕШИРОВАНИЕ И САНИТИЗАЦИЯ
    // ============================================================================
    const trackMetaCache = new Map();
    let lastCompositeKey = '';
    let cachedLyrics = '';
    let lastLyricsCheckTime = 0;

    function decodeHtmlEntities(str) {
        if (!str || typeof str !== 'string') return '';
        try {
            const txt = document.createElement('textarea');
            txt.innerHTML = str;
            return txt.value;
        } catch (e) {
            return str
                .replace(/&amp;/g, '&')
                .replace(/&lt;/g, '<')
                .replace(/&gt;/g, '>')
                .replace(/&quot;/g, '"')
                .replace(/&#39;/g, "'");
        }
    }

    function isValidCoverUrl(url) {
        if (!url || typeof url !== 'string') return false;
        const trimmed = url.trim();
        if (!trimmed || trimmed.startsWith('data:image/svg+xml')) return false;
        return trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('//');
    }

    function extractCoverFromElement(cEl) {
        if (!cEl) return '';
        let candidate = '';
        if (cEl.tagName && cEl.tagName.toLowerCase() === 'img' && cEl.src) {
            candidate = cEl.src;
        } else {
            const bg = window.getComputedStyle(cEl).backgroundImage;
            if (bg && bg !== 'none') {
                const match = bg.match(/url\(["']?(.*?)["']?\)/);
                if (match && match[1]) candidate = match[1];
            }
        }
        if (!isValidCoverUrl(candidate) && cEl.parentElement) {
            const bg = window.getComputedStyle(cEl.parentElement).backgroundImage;
            if (bg && bg !== 'none') {
                const match = bg.match(/url\(["']?(.*?)["']?\)/);
                if (match && match[1]) candidate = match[1];
            }
        }
        return isValidCoverUrl(candidate) ? candidate : '';
    }

    function optimizeCoverUrl(url) {
        if (!isValidCoverUrl(url)) return '';
        if (url.includes('sign=')) return url;
        let u = url;
        u = u.replace(/\/(s|m|x|y)_([^/]+)$/, '/z_$2');
        if (u.includes('/s_')) u = u.replace('/s_', '/z_');
        else if (u.includes('/m_')) u = u.replace('/m_', '/z_');
        else if (u.includes('/x_')) u = u.replace('/x_', '/z_');
        else if (u.includes('/y_')) u = u.replace('/y_', '/z_');
        u = u.replace(/size=\d+x\d+/g, 'size=600x600');
        u = u.replace(/\b(50|68|135|150|200|300)x\1\b/g, '600x600');
        u = u.replace(/quality=\d+/g, 'quality=95');
        return u;
    }

    function hasStatusChanged(prev, next) {
        if (!prev) return true;
        return prev.track !== next.track ||
               prev.artist !== next.artist ||
               prev.playing !== next.playing ||
               prev.duration !== next.duration ||
               prev.cover !== next.cover ||
               prev.liked !== next.liked ||
               prev.shuffled !== next.shuffled ||
               prev.repeated !== next.repeated ||
               prev.nextTrack !== next.nextTrack ||
               prev.lyrics !== next.lyrics ||
               Math.abs((prev.volume || 0) - (next.volume || 0)) > 0.01 ||
               Math.abs((prev.currentTime || 0) - (next.currentTime || 0)) >= 1;
    }

    function sendStatus(force = false) {
        if (!ws || ws.readyState !== WebSocket.OPEN) return;

        try {
            const player = getVkPlayer();
            const aud = getActiveAudio();
            let track = null;
            let playingState = false;
            let title = '';
            let artist = '';
            let currentTime = 0;
            let duration = 0;
            let cover = '';
            let nextTrack = '';

            if (player) {
                try {
                    playingState = Boolean(player.isPlaying && player.isPlaying());
                    track = player.getCurrentAudio ? player.getCurrentAudio() : null;
                } catch (e) {}

                if (track) {
                    title = track[3] ? decodeHtmlEntities(track[3].replace(/<[^>]+>/g, '').trim()) : '';
                    artist = track[4] ? decodeHtmlEntities(track[4].replace(/<[^>]+>/g, '').trim()) : '';

                    if (track[14]) {
                        if (Array.isArray(track[14])) {
                            const cand = track[14][track[14].length - 1];
                            if (isValidCoverUrl(cand)) cover = cand;
                        } else if (typeof track[14] === 'string') {
                            const parts = track[14].split(/[| ,]+/);
                            const cand = parts.length > 0 ? parts[parts.length - 1] : '';
                            if (isValidCoverUrl(cand)) cover = cand;
                        }
                    } else if (track[2] && isValidCoverUrl(track[2])) {
                        cover = track[2];
                    }
                }

                try {
                    const queue = player.getPlaylist ? player.getPlaylist() : null;
                    if (queue && queue.list) {
                        const curId = track ? track[0] : null;
                        const idx = queue.list.findIndex(t => t[0] === curId);
                        if (idx !== -1 && queue.list[idx + 1]) {
                            const nt = queue.list[idx + 1];
                            const ntArtist = decodeHtmlEntities((nt[4] || '').replace(/<[^>]+>/g, ''));
                            const ntTitle = decodeHtmlEntities((nt[3] || '').replace(/<[^>]+>/g, ''));
                            nextTrack = `${ntArtist} - ${ntTitle}`;
                        }
                    }
                } catch (e) {}
            }

            if (!title) {
                const selectors = [
                    { t: '[data-testid="AudioPlayerBlock_AudioTitle"]', a: '[data-testid="AudioPlayerBlock_Authors"]', c: '[data-testid="AudioPlayerBlock_AudioCover"] img' },
                    { t: '.top_audio_player_title', a: '.top_audio_player_artist', c: '.top_audio_player_cover img, .top_audio_player_cover' },
                    { t: '.AudioPlayerMini__title', a: '.AudioPlayerMini__subtitle', c: '.AudioPlayerMini__cover img' },
                    { t: '[data-testid="audioplayeraudioinfo-title"]', a: '[data-testid="AudioPlayerBlock_Authors"]', c: '[data-testid="AudioPlayerBlock_AudioCover"] img' },
                    { t: '.audio_row_playing .audio_row__title', a: '.audio_row_playing .audio_row__performers', c: '.audio_row_playing .audio_row__cover_back img, .audio_row_playing .audio_row__cover_back' },
                    { t: '.audio_page_player_title', a: '.audio_page_player_artist', c: '.audio_page_player_cover img, .audio_page_player_cover' }
                ];
                for (const s of selectors) {
                    const tEl = findInPlayer(s.t);
                    if (tEl && tEl.textContent) {
                        const nt = decodeHtmlEntities(tEl.textContent.trim());
                        if (nt) {
                            title = nt;
                            const aEl = findInPlayer(s.a);
                            if (aEl && aEl.textContent) artist = decodeHtmlEntities(aEl.textContent.trim());
                            if (title.includes('audio_api_unavailable')) {
                                title = 'Track Restricted / Unavailable';
                                artist = 'VK Music';
                            }
                            const cEl = findInPlayer(s.c);
                            const domCover = extractCoverFromElement(cEl);
                            if (domCover) cover = domCover;
                            break;
                        }
                    }
                }
            }

            // Fallback to navigator.mediaSession.metadata when playing in background without visible player header
            if (!title && navigator.mediaSession && navigator.mediaSession.metadata) {
                try {
                    const msMeta = navigator.mediaSession.metadata;
                    if (msMeta.title) title = decodeHtmlEntities(String(msMeta.title).trim());
                    if (!artist && msMeta.artist) artist = decodeHtmlEntities(String(msMeta.artist).trim());
                    if (!cover && Array.isArray(msMeta.artwork) && msMeta.artwork.length > 0) {
                        const bestArt = msMeta.artwork[msMeta.artwork.length - 1];
                        if (bestArt && bestArt.src && isValidCoverUrl(bestArt.src)) {
                            cover = bestArt.src;
                        }
                    }
                } catch (e) {}
            }

            const compositeKey = (track && track[1] && track[0])
                ? `${track[1]}_${track[0]}`
                : `${artist}|||${title}`;

            const isTrackChanged = compositeKey !== lastCompositeKey;
            if (isTrackChanged) {
                lastCompositeKey = compositeKey;
                cachedLyrics = '';
            }

            const now = Date.now();
            const cachedEntry = trackMetaCache.get(compositeKey);
            if (cachedEntry && (now - cachedEntry.timestamp > TRACK_CACHE_TTL)) {
                trackMetaCache.delete(compositeKey);
            }

            if (cover) {
                cover = optimizeCoverUrl(cover);
                if (title && title !== 'VK Музыка') {
                    trackMetaCache.set(compositeKey, {
                        title,
                        artist,
                        cover,
                        timestamp: now
                    });
                }
            } else if (cachedEntry && (now - cachedEntry.timestamp <= TRACK_CACHE_TTL) && cachedEntry.cover) {
                cover = cachedEntry.cover;
            }

            // Limit cache size
            if (trackMetaCache.size > 50) {
                const oldestKey = trackMetaCache.keys().next().value;
                if (oldestKey) trackMetaCache.delete(oldestKey);
            }

            if (!playingState) {
                playingState = isPlaying(aud, player);
            }

            // Extra control states
            let shuffled = false;
            let repeated = 'off';
            const shuffleBtn = findInPlayer('[data-testid="AudioPlayerBlock_ShuffleSwitcher"]') ||
                               findInPlayer('[data-testid="ToggleShuffled"]') ||
                               findInPlayer('[data-testid="audio-player-controls-shuffle-button"]') ||
                               findInPlayer('.top_audio_player_btn_shuffle');
            if (shuffleBtn) {
                shuffled = shuffleBtn.getAttribute('aria-checked') === 'true' ||
                           shuffleBtn.getAttribute('data-testactive') === 'true' ||
                           shuffleBtn.getAttribute('data-teststate') === 'active' ||
                           shuffleBtn.classList.contains('active') ||
                           shuffleBtn.classList.contains('top_audio_player_btn_shuffle_on');
            }

            const repeatBtn = findInPlayer('[data-testid="AudioPlayerBlock_RepeatSwitcher"]') ||
                              findInPlayer('[data-testid="audio-player-controls-repeat-button"]') ||
                              findInPlayer('.top_audio_player_btn_repeat') ||
                              findInPlayer('[data-testid="RepeatSwitcher"]');
            if (repeatBtn) {
                const actualBtn = repeatBtn.closest('button') || repeatBtn.closest('[role="button"]') || repeatBtn.closest('.top_audio_player_btn_repeat') || repeatBtn;
                const teststate = actualBtn.getAttribute('data-teststate') ?? repeatBtn.getAttribute('data-teststate');

                let apiRepeat = undefined;
                if (player) {
                    const r = typeof player.getRepeat === 'function' ? player.getRepeat() : (player._repeat !== undefined ? player._repeat : player.repeat);
                    if (r !== undefined) {
                        apiRepeat = r === 2 || r === 'track' ? 'track' : (r === 1 || r === 'playlist' || r === true ? 'playlist' : 'off');
                    }
                }

                if (teststate !== null && teststate !== undefined) {
                    if (teststate === 'queue' || teststate === 'playlist') repeated = 'playlist';
                    else if (teststate === 'audio' || teststate === 'track' || teststate === 'one') repeated = 'track';
                    else repeated = 'off';
                } else if (apiRepeat !== undefined) {
                    repeated = apiRepeat;
                } else {
                    const classListStr = (actualBtn.className || '').toString().toLowerCase();
                    const ariaChecked = actualBtn.getAttribute('aria-checked');
                    const testactive = actualBtn.getAttribute('data-testactive');
                    const titleAttr = (actualBtn.getAttribute('title') || actualBtn.getAttribute('aria-label') || '').toLowerCase();
                    const isRepeatOn = classListStr.includes('active') ||
                                       classListStr.includes('checked') ||
                                       ariaChecked === 'true' ||
                                       ariaChecked === 'mixed' ||
                                       testactive === 'true' ||
                                       testactive === 'playlist' ||
                                       testactive === 'track';
                    if (!isRepeatOn) {
                        repeated = 'off';
                    } else if (ariaChecked === 'mixed' || testactive === 'playlist' || titleAttr.includes('плейлист') || titleAttr.includes('списк')) {
                        repeated = 'playlist';
                    } else if (testactive === 'track' || titleAttr.includes('трек') || titleAttr.includes('один') || titleAttr.includes('одну')) {
                        repeated = 'track';
                    } else {
                        repeated = 'playlist';
                    }
                }
            }

            const liked = detectLikeActive(isTrackChanged, force);

            if (isTrackChanged || force || (now - lastLyricsCheckTime > 5000)) {
                lastLyricsCheckTime = now;
                const lyrSelectors = [
                    '[data-testid="audio-player-lyrics-text"]',
                    '[data-testid="audio-player-lyrics"]',
                    '.AudioLyrics__text',
                    '.AudioLyrics__lines',
                    '.audio_lyrics_text'
                ];
                for (const s of lyrSelectors) {
                    const el = document.querySelector(s);
                    if (el && el.textContent && el.textContent.trim()) {
                        cachedLyrics = el.innerText.split('\n').map(l => l.trim()).filter(Boolean).join('\n');
                        break;
                    }
                }
            }

            if (aud && aud.duration > 5 && Number.isFinite(aud.currentTime)) {
                currentTime = aud.currentTime;
            } else if (player && typeof player.getStats === 'function') {
                const stats = player.getStats();
                if (stats && typeof stats[2] === 'number') currentTime = stats[2];
            } else {
                currentTime = 0;
            }

            if (aud && aud.duration > 5 && Number.isFinite(aud.duration)) {
                duration = aud.duration;
            } else if (track && typeof track[5] === 'number') {
                duration = track[5];
            } else {
                duration = 0;
            }

            const volume = Math.round(detectVkVolume(player) * 100) / 100;
            const roundedTime = Math.floor(currentTime);

            const payload = {
                type: 'status',
                track: title,
                artist: artist,
                playing: playingState,
                currentTime: roundedTime,
                duration: Math.floor(duration || 0),
                cover: cover,
                nextTrack: nextTrack,
                lyrics: cachedLyrics,
                shuffled: shuffled,
                repeated: repeated,
                liked: liked,
                volume: volume
            };

            if (!force && !hasStatusChanged(lastSentStatus, payload)) return;

            ws.send(JSON.stringify(payload));
            lastSentStatus = payload;
        } catch (e) {}
    }

    // ============================================================================
    // СЕКЦИЯ 7: AUDIO LISTENERS, MUTATION OBSERVER И ЖИЗНЕННЫЙ ЦИКЛ
    // ============================================================================
    let lastTimeUpdate = 0;
    let lastReportedTime = -1;

    function bindAudioEvents(aud) {
        if (!aud || boundAudios.has(aud)) return;
        boundAudios.add(aud);
        if (typeof lastArcSetVolume === 'number' && !isSoundEffect(aud)) {
            try {
                aud.volume = Math.pow(lastArcSetVolume, 3);
                aud.muted = (lastArcSetVolume === 0);
            } catch (e) {}
        }
        const events = ['play', 'pause', 'ended', 'seeked', 'durationchange'];
        events.forEach(evt => {
            aud.addEventListener(evt, () => {
                if (!isSoundEffect(aud)) {
                    activeVkAudio = aud;
                    scheduleStatusPush(true, 50);
                }
            }, { passive: true });
        });
        aud.addEventListener('volumechange', () => {
            // Suppress echo status push during A.R.C. volume lockout window
            if (Date.now() - lastArcSetVolumeTime < EXTERNAL_VOLUME_LOCKOUT_MS) return;
            if (!isSoundEffect(aud)) {
                scheduleStatusPush(true, 80);
            }
        }, { passive: true });
        aud.addEventListener('timeupdate', () => {
            if (isSoundEffect(aud)) return;
            const now = Date.now();
            const cur = Math.floor(aud.currentTime);
            if (cur !== lastReportedTime && now - lastTimeUpdate >= 900) {
                lastTimeUpdate = now;
                lastReportedTime = cur;
                sendStatus(false);
            }
        }, { passive: true });
    }

    let scanTimer = null;
    function scanAndBindAudios() {
        const audios = document.getElementsByTagName('audio');
        for (let i = 0; i < audios.length; i++) {
            bindAudioEvents(audios[i]);
        }
    }

    function initObserver() {
        if (!document.body) {
            setTimeout(initObserver, 100);
            return;
        }
        if (observer) observer.disconnect();

        observer = new MutationObserver((mutations) => {
            if (cachedPlayBtn && !document.contains(cachedPlayBtn)) {
                cachedPlayBtn = null;
            }
            if (!observedVolumeSliderEl || !document.contains(observedVolumeSliderEl)) {
                bindVolumeSliderObserver();
            }
            if (scanTimer) return;
            let hasAddedNodes = false;
            for (let i = 0; i < mutations.length; i++) {
                if (mutations[i].addedNodes && mutations[i].addedNodes.length > 0) {
                    hasAddedNodes = true;
                    break;
                }
            }
            if (!hasAddedNodes) return;
            bindVolumeSliderObserver();
            scanTimer = setTimeout(() => {
                scanTimer = null;
                scanAndBindAudios();
            }, 2000);
        });

        observer.observe(document.body, { childList: true, subtree: true });
        scanAndBindAudios();
        bindVolumeSliderObserver();
    }

    function startPositionHeartbeat() {
        if (positionHeartbeatTimer) clearTimeout(positionHeartbeatTimer);
        lastPositionTickTime = Date.now();

        const tick = () => {
            const now = Date.now();
            const activeAud = getActiveAudio();
            const player = getVkPlayer();
            const currentlyPlaying = isPlaying(activeAud, player);
            const expectedInterval = (document.hidden && !currentlyPlaying) ? BG_IDLE_SCAN_INTERVAL : PORT_SCAN_INTERVAL;
            const delta = now - lastPositionTickTime;
            lastPositionTickTime = now;

            // Detect system wake from sleep/hibernation
            if (delta > expectedInterval + SLEEP_WAKE_THRESHOLD_MS) {
                if (!ws || ws.readyState !== WebSocket.OPEN) {
                    scheduleReconnect(80);
                } else {
                    scheduleStatusPush(true, 100);
                }
            } else if (!document.hidden || currentlyPlaying) {
                sendStatus(false);
            }

            const nextInterval = (document.hidden && !currentlyPlaying) ? BG_IDLE_SCAN_INTERVAL : PORT_SCAN_INTERVAL;
            positionHeartbeatTimer = setTimeout(tick, nextInterval);
        };

        positionHeartbeatTimer = setTimeout(tick, PORT_SCAN_INTERVAL);
    }

    function isVolumeSliderTarget(t) {
        if (!t || !t.closest) return false;
        const volNode = t.closest('[data-testid="audioplayervolumeslider-bar-slider"], [data-testid="audioplayervolumeslider-bar"], [data-testid="AudioPlayerBlock_VolumeSlider"], [data-testid*="volumeslider" i], .top_audio_player_volume, .audio_page_player_volume_slider');
        if (volNode) return true;
        const sliderNode = t.closest('[role="slider"]');
        if (sliderNode) {
            const tid = (sliderNode.getAttribute('data-testid') || '').toLowerCase();
            if (!tid.includes('progress') && !tid.includes('track') && !tid.includes('time')) {
                return true;
            }
        }
        return false;
    }

    function onPlayerPointerDown(e) {
        if (!e.isTrusted) return;
        const t = e.target;
        if (isVolumeSliderTarget(t)) {
            isUserDraggingVolume = true;
            lastArcSetVolume = null;
            scheduleStatusPush(true, 50);
            return;
        }
        if (t && t.closest && t.closest('[data-testid*="AudioPlayer"], [data-testid*="audio-player"], [data-testid*="audioplayer" i], .top_audio_player, .audio_page_player2')) {
            scheduleStatusPush(true, 120);
        }
    }

    function onPlayerPointerMove(e) {
        if (!isUserDraggingVolume || !e.isTrusted) return;
        const now = Date.now();
        if (now - lastUserDragPushTime >= 90) {
            lastUserDragPushTime = now;
            lastArcSetVolume = null;
            scheduleStatusPush(true, 30);
        }
    }

    function onPlayerPointerUp(e) {
        if (isUserDraggingVolume) {
            isUserDraggingVolume = false;
            userDragEndTime = Date.now();
            lastArcSetVolume = null;
            scheduleStatusPush(true, 80);
            return;
        }
        if (!e.isTrusted) return;
        const t = e.target;
        if (t && t.closest && t.closest('[data-testid*="AudioPlayer"], [data-testid*="audio-player"], [data-testid*="audioplayer" i], .top_audio_player, .audio_page_player2')) {
            scheduleStatusPush(true, 120);
        }
    }

    document.addEventListener('pointerdown', onPlayerPointerDown, { passive: true });
    document.addEventListener('mousedown', onPlayerPointerDown, { passive: true });
    document.addEventListener('pointermove', onPlayerPointerMove, { passive: true });
    document.addEventListener('pointerup', onPlayerPointerUp, { passive: true });
    document.addEventListener('mouseup', onPlayerPointerUp, { passive: true });
    document.addEventListener('pointercancel', onPlayerPointerUp, { passive: true });

    // SPA Navigation Hooks for VK transitions (e.g. Feed <-> My Music)
    let lastKnownHref = window.location.href;
    function onSpaNavigation() {
        const curHref = window.location.href;
        if (curHref === lastKnownHref) return;
        lastKnownHref = curHref;
        cachedPlayBtn = null;
        setTimeout(() => {
            scanAndBindAudios();
            bindVolumeSliderObserver();
            scheduleStatusPush(false, 120);
        }, 180);
        setTimeout(() => {
            scanAndBindAudios();
            bindVolumeSliderObserver();
        }, 650);
    }

    function initSpaNavigationHooks() {
        try {
            const origPushState = history.pushState;
            if (typeof origPushState === 'function') {
                history.pushState = function(...args) {
                    const res = origPushState.apply(this, args);
                    onSpaNavigation();
                    return res;
                };
            }
            const origReplaceState = history.replaceState;
            if (typeof origReplaceState === 'function') {
                history.replaceState = function(...args) {
                    const res = origReplaceState.apply(this, args);
                    onSpaNavigation();
                    return res;
                };
            }
        } catch (e) {}
        window.addEventListener('popstate', onSpaNavigation, { passive: true });
    }

    function verifySocketOnWakeOrFocus() {
        scanAndBindAudios();
        bindVolumeSliderObserver();
        if (!ws || ws.readyState !== WebSocket.OPEN) {
            scheduleReconnect(80);
        } else if (typeof ws.bufferedAmount === 'number' && ws.bufferedAmount > 2048) {
            forceReconnectSocket('wake_buffered_backlog');
        } else {
            try {
                ws.send(JSON.stringify({ type: 'ping', timestamp: Date.now() }));
            } catch (e) {
                forceReconnectSocket('wake_ping_failed');
                return;
            }
            scheduleStatusPush(true, 100);
        }
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            verifySocketOnWakeOrFocus();
        }
    });

    window.addEventListener('focus', () => {
        verifySocketOnWakeOrFocus();
    });

    window.addEventListener('online', () => {
        verifySocketOnWakeOrFocus();
    });

    window.addEventListener('beforeunload', () => {
        clearHeartbeat();
        if (positionHeartbeatTimer) {
            clearTimeout(positionHeartbeatTimer);
            positionHeartbeatTimer = null;
        }
        if (volumeSliderObserver) {
            try { volumeSliderObserver.disconnect(); } catch (e) {}
            volumeSliderObserver = null;
            observedVolumeSliderEl = null;
        }
        if (observer) {
            observer.disconnect();
            observer = null;
        }
        if (ws) {
            try { ws.close(1000, 'page_unload'); } catch (e) {}
        }
    });

    // Auto-play feature when opened with ?arc-autoplay=1
    function setupAutoplayIfRequested() {
        if (!window.location.href.includes('arc-autoplay=1')) return;
        try {
            const cleanUrl = window.location.href
                .replace(/([?&])arc-autoplay=1(&|$)/, (match, p1, p2) => (p1 === '?' && p2 === '&' ? '?' : (p2 === '&' ? p1 : '')))
                .replace(/[?&]$/, '');
            window.history.replaceState(null, '', cleanUrl);
        } catch (e) {}
        let autoAttempts = 0;
        const checkReady = () => {
            autoAttempts++;
            const played = triggerDomPlayFallback(getVkPlayer());
            if (played) log('Auto-play triggered');
            else if (autoAttempts < MAX_AUTOPLAY_ATTEMPTS) setTimeout(checkReady, 1000);
        };
        if (document.readyState === 'complete') checkReady();
        else window.addEventListener('load', checkReady, { once: true });
    }

    function initWhenReady() {
        const start = () => {
            connect();
            setTimeout(() => {
                if (!hasEverConnected) {
                    console.warn('[A.R.C. VK] Соединение не установлено за 30с. Возможно Chrome 147+ блокирует ws://127.0.0.1. См. chrome://flags/#local-network-access-check');
                }
            }, 30000);
            initSpaNavigationHooks();
            initObserver();
            startPositionHeartbeat();
            setupAutoplayIfRequested();
        };
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', start, { once: true });
        } else {
            start();
        }
    }

    initWhenReady();
})();
