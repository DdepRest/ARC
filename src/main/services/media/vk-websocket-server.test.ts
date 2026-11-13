import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { VkWebSocketServer } from './vk-websocket-server';
import { WebSocket } from 'ws';
import { VkCommandAction } from '../../../shared/types/ipc';

vi.mock('electron', () => ({
  BrowserWindow: {
    getAllWindows: vi.fn().mockReturnValue([])
  }
}));

describe('VkWebSocketServer Integration & Contract', () => {
  let server: VkWebSocketServer;

  beforeEach(() => {
    server = new VkWebSocketServer();
  });

  afterEach(() => {
    server.stop();
  });

  it('should start on default port 8765 and report running status', async () => {
    server.start(8765);
    // Give server time to listen
    await new Promise((res) => setTimeout(res, 100));

    expect(server.isRunning()).toBe(true);
    expect(server.getPort()).toBe(8765);
    expect(server.getClientCount()).toBe(0);
    expect(server.getLastError()).toBeNull();

    const status = server.getConnectionStatus();
    expect(status).toEqual({
      connectedClientsCount: 0,
      serverPort: 8765,
      serverError: null,
      serverRunning: true,
    });
  });

  it('should reject sendCommand when no clients are connected', () => {
    const result = server.sendCommand('play');
    expect(result).toEqual({
      success: false,
      reason: 'no_clients',
      clientCount: 0,
    });
  });

  it('should update client count on WS connect and close, and successfully send commands', async () => {
    server.start(8765);
    await new Promise((res) => setTimeout(res, 100));

    const wsUrl = `ws://127.0.0.1:${server.getPort()}`;
    const client = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => client.on('open', resolve));
    await new Promise((res) => setTimeout(res, 50));

    expect(server.getClientCount()).toBe(1);
    expect(server.getConnectionStatus().connectedClientsCount).toBe(1);

    // Send command to connected client
    const sendResult = server.sendCommand('volume', { value: 1 });
    expect(sendResult).toEqual({
      success: true,
      clientCount: 1,
    });

    // Close client
    client.close();
    await new Promise((res) => setTimeout(res, 50));

    expect(server.getClientCount()).toBe(0);
    expect(server.getConnectionStatus().connectedClientsCount).toBe(0);

    // Subsequent command should fail with no_clients
    const afterCloseResult = server.sendCommand('play');
    expect(afterCloseResult.success).toBe(false);
    expect(afterCloseResult.reason).toBe('no_clients');
  });

  it('should cycle to next port on EADDRINUSE', async () => {
    // Start first server on 8765
    server.start(8765);
    await new Promise((res) => setTimeout(res, 100));
    expect(server.getPort()).toBe(8765);

    // Start second server attempting 8765; it should cycle to 8766
    const server2 = new VkWebSocketServer();
    server2.start(8765);
    await new Promise((res) => setTimeout(res, 150));

    expect(server2.getPort()).toBe(8766);
    expect(server2.isRunning()).toBe(true);

    server2.stop();
  });

  it('should reject unsupported action commands with reason unsupported_action', () => {
    // Define a safe test type to check runtime boundaries
    type TestActionBoundary = VkCommandAction | 'unsupported_command_xyz';
    const badCommand = 'unsupported_command_xyz' as TestActionBoundary as VkCommandAction;
    const result = server.sendCommand(badCommand);
    expect(result).toEqual({
      success: false,
      reason: 'unsupported_action',
      clientCount: 0,
    });
  });

  it('should treat CLOSING or CLOSED sockets as stale and clean them up', async () => {
    server.start(8765);
    await new Promise((res) => setTimeout(res, 100));

    const wsUrl = `ws://127.0.0.1:${server.getPort()}`;
    const client = new WebSocket(wsUrl);

    await new Promise<void>((resolve) => client.on('open', resolve));
    await new Promise((res) => setTimeout(res, 50));

    expect(server.getClientCount()).toBe(1);

    // Get server side socket reference from server clients map and set readyState to CLOSED
    const [serverWs] = Array.from((server as any).clients.keys());
    Object.defineProperty(serverWs, 'readyState', { value: WebSocket.CLOSED, configurable: true });

    expect(server.getClientCount()).toBe(0);

    const sendResult = server.sendCommand('play');
    expect(sendResult.success).toBe(false);

    client.close();
  });

  it('should set lastError and stop when port range 8765-8770 is exhausted', () => {
    server.start(8771);
    expect(server.isRunning()).toBe(false);
    expect(server.getPort()).toBeNull();
    expect(server.getLastError()).toBe('All ports from 8765 to 8770 are in use.');
  });

  it('should not let constant volume: 1 from uncalibrated client overwrite A.R.C. volume, but should sync real VK volume changes', async () => {
    server.start(8765);
    await new Promise((res) => setTimeout(res, 100));

    const wsUrl = `ws://127.0.0.1:${server.getPort()}`;
    const client = new WebSocket(wsUrl);
    await new Promise<void>((resolve) => client.on('open', resolve));
    await new Promise((res) => setTimeout(res, 50));

    // 1. Client sends uncalibrated volume: 1 on initial connect -> should default to 0.5, not 1.0
    client.send(JSON.stringify({ type: 'status', track: 'BPD', artist: 'YNG Martyr', playing: true, volume: 1 }));
    await new Promise((res) => setTimeout(res, 50));
    expect(server.lastStatus?.volume).toBe(0.5);

    // 2. A.R.C. sets volume to 0.25 (25%)
    server.sendCommand('volume', { value: 0.25 });
    expect(server.lastStatus?.volume).toBe(0.25);

    // 3. Even if cooldown expires and client keeps sending volume: 1, volume stays 0.25
    (server as any).lastVolumeCmdAt = Date.now() - 5000;
    client.send(JSON.stringify({ type: 'status', track: 'BPD', artist: 'YNG Martyr', playing: true, volume: 1 }));
    await new Promise((res) => setTimeout(res, 50));
    expect(server.lastStatus?.volume).toBe(0.25);

    // 4. User genuinely changes volume inside VK browser tab to 0.40 (40%)
    client.send(JSON.stringify({ type: 'status', track: 'BPD', artist: 'YNG Martyr', playing: true, volume: 0.4 }));
    await new Promise((res) => setTimeout(res, 50));
    expect(server.lastStatus?.volume).toBe(0.4);

    client.close();
  });
});

