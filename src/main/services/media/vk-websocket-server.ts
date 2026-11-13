import { WebSocketServer, WebSocket } from 'ws';
import { BrowserWindow } from 'electron';
import { VkConnectionStatusPayload, VkSendResult, isSupportedVkCommand, VkStatusPayload, VkCommandAction, VkControlPayload } from '../../../shared/types/ipc';

export type { VkConnectionStatusPayload, VkSendResult };

export class VkWebSocketServer {
  private wss: WebSocketServer | null = null;
  private clients: Map<WebSocket, { isPlaying: boolean; lastUpdate: number; track: string }> = new Map();
  private primaryClient: WebSocket | null = null;
  private primarySelectionTime = 0;
  private port: number | null = null;
  private lastError: string | null = null;
  private running = false;
  private lastClientRawVolume: number | null = null;
  private arcVolumeOverride: number | null = null;
  private lastVolumeCmdAt = 0;
  public lastStatus: VkStatusPayload | null = null;

  public cleanStaleClients(): void {
    for (const [ws] of this.clients) {
      if (ws.readyState !== WebSocket.OPEN) {
        if (this.primaryClient === ws) this.primaryClient = null;
        this.clients.delete(ws);
      }
    }
  }

  public getPort(): number | null {
    return this.port;
  }

  public getClientCount(): number {
    this.cleanStaleClients();
    return this.clients.size;
  }

  public getLastError(): string | null {
    return this.lastError;
  }

  public isRunning(): boolean {
    return this.running;
  }

  public getConnectionStatus(syncClient = true): VkConnectionStatusPayload {
    const clientCount = this.getClientCount();
    if (syncClient && clientCount > 0) {
      if (this.lastStatus) {
        this.broadcastStatus(this.lastStatus);
      }
      this.sendCommand('sync');
    }
    return {
      connectedClientsCount: clientCount,
      serverPort: this.getPort(),
      serverError: this.getLastError(),
      serverRunning: this.isRunning(),
    };
  }

  private broadcastStatus(payload: VkStatusPayload) {
    setImmediate(() => {
      try {
        const wins = BrowserWindow.getAllWindows();
        wins.forEach((win: BrowserWindow) => {
          try {
            if (!win.isDestroyed?.()) {
              win.webContents.send('media:vk-status', payload);
            }
          } catch (_) { console.warn('Ignored error in catch', _); }
        });
      } catch (_) { console.warn('Ignored error in catch', _); }
    });
  }

  public notifyConnectionStatus() {
    const status = this.getConnectionStatus(false);
    setImmediate(() => {
      try {
        const wins = BrowserWindow.getAllWindows();
        wins.forEach((win: BrowserWindow) => {
          try {
            if (!win.isDestroyed?.()) {
              win.webContents.send('media:vk-connection-status', status);
            }
          } catch (_) { console.warn('Ignored error in catch', _); }
        });
      } catch (_) { console.warn('Ignored error in catch', _); }
    });
  }

  public stop() {
    if (this.wss) {
      try {
        this.wss.close();
      } catch (_) { console.warn('Ignored error in catch', _); }
      this.wss = null;
    }
    this.clients.clear();
    this.primaryClient = null;
    this.running = false;
    this.port = null;
    this.lastError = null;
    this.lastClientRawVolume = null;
    this.notifyConnectionStatus();
  }

  start(attemptPort = 8765) {
    if (this.wss) return;
    if (attemptPort > 8770) {
      const errMsg = 'All ports from 8765 to 8770 are in use.';
      console.error(`[VK WS] ${errMsg}`);
      this.lastError = errMsg;
      this.running = false;
      this.port = null;
      this.notifyConnectionStatus();
      return;
    }

    try {
      const wssInstance = new WebSocketServer({ port: attemptPort, host: '127.0.0.1' });
      this.wss = wssInstance;

      wssInstance.on('listening', () => {
        this.port = attemptPort;
        this.running = true;
        this.lastError = null;
        console.log(`[VK WS] Server successfully started on port ${this.port}`);
        this.notifyConnectionStatus();
      });

      wssInstance.on('connection', (ws) => {
        console.log(`[VK WS] Client connected on port ${this.port}`);
        this.clients.set(ws, { isPlaying: false, lastUpdate: Date.now(), track: '' });
        this.notifyConnectionStatus();

        ws.on('message', (message: Buffer | ArrayBuffer | Buffer[]) => {
          setImmediate(() => {
            try {
              const data = JSON.parse(message.toString());
              if (data.type === 'ping') {
                try {
                  ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
                } catch (_) { console.warn('Ignored error in catch', _); }
                return;
              }

            if (data.type === 'status') {
              const clientInfo = this.clients.get(ws);
              if (clientInfo) {
                if (data.lyrics && (!clientInfo || clientInfo.track !== data.track)) {
                  console.log(`[VK WS] Lyrics detected for ${data.track}`);
                }
                clientInfo.isPlaying = !!data.playing;
                clientInfo.lastUpdate = Date.now();
                clientInfo.track = data.track || '';
              }

              // Election logic:
              const now = Date.now();
              const isSticky = this.primaryClient && now - this.primarySelectionTime < 3000;

              if (!this.primaryClient || !this.clients.has(this.primaryClient)) {
                this.primaryClient = ws;
                this.primarySelectionTime = now;
              } else if (!isSticky) {
                const primaryInfo = this.clients.get(this.primaryClient);

                const thisHasRealTrack =
                  data.track &&
                  !data.track.toLowerCase().includes('vk') &&
                  !data.track.toLowerCase().includes('музыка');
                const primaryHasRealTrack =
                  primaryInfo &&
                  primaryInfo.track &&
                  !primaryInfo.track.toLowerCase().includes('vk') &&
                  !primaryInfo.track.toLowerCase().includes('музыка');

                if (data.playing && (!primaryInfo || !primaryInfo.isPlaying)) {
                  this.primaryClient = ws;
                  this.primarySelectionTime = now;
                } else if (thisHasRealTrack && !primaryHasRealTrack && data.playing === primaryInfo?.isPlaying) {
                  this.primaryClient = ws;
                  this.primarySelectionTime = now;
                }
              }

              // Only the primary client gets to update the UI
              if (ws !== this.primaryClient) return;

              let formattedTitle = 'VK Player';
              if (data.track && data.artist) {
                formattedTitle = `${data.artist} — ${data.track}`;
              } else if (data.track) {
                formattedTitle = data.track;
              }

              let resolvedVolume = this.arcVolumeOverride ?? this.lastStatus?.volume ?? 0.5;
              if (typeof data.volume === 'number') {
                const incomingVol = Math.min(1, Math.max(0, data.volume));
                const prevRaw = this.lastClientRawVolume;
                this.lastClientRawVolume = incomingVol;
                const isCooldown = Date.now() - this.lastVolumeCmdAt <= 2500;
                const isInitialReal = prevRaw === null && incomingVol < 1;
                const isBogusJumpToMax = incomingVol === 1 && (prevRaw === null || prevRaw < 0.75);
                const isGenuineChange = prevRaw !== null && Math.abs(incomingVol - prevRaw) >= 0.01 && !isBogusJumpToMax;
                if (!isCooldown && (isInitialReal || isGenuineChange)) {
                  this.arcVolumeOverride = incomingVol;
                  resolvedVolume = incomingVol;
                }
              }

              const statusPayload: VkStatusPayload = {
                title: formattedTitle,
                track: data.track || '',
                artist: data.artist || '',
                playing: Boolean(data.playing),
                closed: false,
                currentTime: data.currentTime || 0,
                duration: data.duration || 0,
                cover: data.cover || '',
                nextTrack: data.nextTrack || '',
                lyrics: data.lyrics || '',
                shuffled: !!data.shuffled,
                repeated: typeof data.repeated === 'string' ? data.repeated : !!data.repeated,
                liked: !!data.liked,
                volume: resolvedVolume,
              };

              this.lastStatus = statusPayload;
              this.broadcastStatus(statusPayload);
            }
            } catch (e) {
              console.error('[VK WS] Error parsing message:', e);
            }
          });
        });

        ws.on('close', () => {
          console.log(`[VK WS] Client disconnected on port ${this.port}`);
          if (this.primaryClient === ws) this.primaryClient = null;
          this.clients.delete(ws);
          this.notifyConnectionStatus();
        });

        ws.on('error', () => {
          if (this.primaryClient === ws) this.primaryClient = null;
          this.clients.delete(ws);
          this.notifyConnectionStatus();
        });
      });

      wssInstance.on('error', (err: Error & { code?: string }) => {
        if (err.code === 'EADDRINUSE') {
          console.warn(`[VK WS] Port ${attemptPort} is in use, trying next...`);
          this.lastError = `Port ${attemptPort} is in use`;
          this.running = false;
          this.port = null;
          this.wss = null;
          this.notifyConnectionStatus();
          this.start(attemptPort + 1);
        } else {
          console.error('[VK WS] WebSocket Server error:', err);
          this.lastError = err?.message || String(err);
          this.notifyConnectionStatus();
        }
      });
    } catch (e: unknown) {
      const err = e as { code?: string; message?: string };
      if (err?.code === 'EADDRINUSE') {
        console.warn(`[VK WS] Sync port ${attemptPort} is in use, trying next...`);
        this.lastError = `Port ${attemptPort} is in use`;
        this.running = false;
        this.port = null;
        this.wss = null;
        this.notifyConnectionStatus();
        this.start(attemptPort + 1);
      } else {
        console.error(`[VK WS] Failed to init on port ${attemptPort}:`, e);
        this.lastError = err?.message || String(e);
        this.running = false;
        this.notifyConnectionStatus();
      }
    }
  }

  sendCommand<T extends VkCommandAction>(command: T, data?: VkControlPayload<T>): VkSendResult {
    if (!isSupportedVkCommand(command)) {
      return {
        success: false,
        reason: 'unsupported_action',
        clientCount: this.getClientCount(),
      };
    }

    const clientCount = this.getClientCount();
    if (clientCount === 0) {
      return { success: false, reason: 'no_clients', clientCount: 0 };
    }

    if (command === 'volume' && data && typeof (data as any).value === 'number') {
      const v = Math.min(1, Math.max(0, (data as any).value));
      this.arcVolumeOverride = v;
      this.lastVolumeCmdAt = Date.now();
      if (this.lastStatus) {
        this.lastStatus.volume = v;
      }
    }

    const message = JSON.stringify({ command, data });
    let sent = false;

    // Prioritize primary client
    if (this.primaryClient && this.primaryClient.readyState === WebSocket.OPEN) {
      try {
        this.primaryClient.send(message);
        sent = true;
      } catch (_) {
        this.primaryClient = null;
      }
    }

    if (!sent) {
      for (const [client] of this.clients) {
        if (client.readyState === WebSocket.OPEN) {
          try {
            client.send(message);
            sent = true;
            break;
          } catch (_) { console.warn('Ignored error in catch', _); }
        }
      }
    }

    if (!sent) {
      this.cleanStaleClients();
      return { success: false, reason: 'no_open_socket', clientCount: this.getClientCount() };
    }

    return { success: true, clientCount: this.getClientCount() };
  }

  hasClients(): boolean {
    return this.getClientCount() > 0;
  }
}

export const vkWebSocketServer = new VkWebSocketServer();
export default vkWebSocketServer;
