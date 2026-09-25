/**
 * WuzzChat WebSocket Client Singleton
 * Connects to Go Backend WebSocket Hub (RFC 6455).
 * Implements Exponential Backoff Reconnect & Close Code 4001 Terminal Guard.
 * Reference: docs/MOBILE_INTEGRATION_GUIDE.md Section 2B & 2C.
 */

import { getBaseWsUrl } from '../api/config';

export type ConnectionState = 'disconnected' | 'connecting' | 'connected' | 'reconnecting' | 'terminated';

export type WebSocketEventListener = (data: any) => void;
export type SessionReplacedCallback = (reason: string) => void;

class WebSocketClient {
  private ws: WebSocket | null = null;
  private token: string | null = null;
  private deviceId: string | null = null;

  private state: ConnectionState = 'disconnected';
  private reconnectAttempt = 0;
  private reconnectTimer: any = null;
  private isExplicitlyClosed = false;
  private isTerminated = false;

  private listeners: Map<string, Set<WebSocketEventListener>> = new Map();
  private stateChangeListeners: Set<(state: ConnectionState) => void> = new Set();
  private sessionReplacedHandler: SessionReplacedCallback | null = null;

  private readonly INITIAL_RECONNECT_DELAY_MS = 1000;
  private readonly MAX_RECONNECT_DELAY_MS = 30000;

  /**
   * Register callback when Close Code 4001: SESSION_REPLACED is triggered.
   */
  public onSessionReplaced(handler: SessionReplacedCallback): void {
    this.sessionReplacedHandler = handler;
  }

  /**
   * Subscribe to connection state changes.
   */
  public onStateChange(listener: (state: ConnectionState) => void): () => void {
    this.stateChangeListeners.add(listener);
    listener(this.state);
    return () => {
      this.stateChangeListeners.delete(listener);
    };
  }

  private setState(newState: ConnectionState) {
    this.state = newState;
    this.stateChangeListeners.forEach((listener) => listener(newState));
  }

  public getState(): ConnectionState {
    return this.state;
  }

  /**
   * Connect to WebSocket with token & device_id.
   */
  public connect(token: string, deviceId: string): void {
    if (this.isTerminated) {
      console.warn('[WS] Client has been terminated due to session replacement. Reset before reconnecting.');
      return;
    }

    this.token = token;
    this.deviceId = deviceId;
    this.isExplicitlyClosed = false;
    this.clearReconnectTimer();

    this.initSocket();
  }

  private initSocket(): void {
    if (!this.token || !this.deviceId || this.isExplicitlyClosed || this.isTerminated) {
      return;
    }

    if (this.ws && (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING)) {
      return;
    }

    this.setState(this.reconnectAttempt > 0 ? 'reconnecting' : 'connecting');

    const baseUrl = getBaseWsUrl();
    const wsUrl = `${baseUrl}?token=${encodeURIComponent(this.token)}&device_id=${encodeURIComponent(this.deviceId)}`;

    const originHeader = baseUrl.includes('localhost') || baseUrl.includes('10.0.2.2')
      ? 'http://localhost:3000'
      : 'https://chat.wuzzhub.id';

    try {
      const ws = new (WebSocket as any)(wsUrl, undefined, {
        headers: {
          Origin: originHeader,
        },
      }) as WebSocket;
      this.ws = ws;

      ws.onopen = () => {
        console.log('[WS] Connected successfully to WuzzChat Hub');
        this.reconnectAttempt = 0;
        this.clearReconnectTimer();
        this.setState('connected');
      };

      ws.onmessage = (event) => {
        try {
          const parsed = JSON.parse(event.data);
          this.dispatchMessage(parsed);
        } catch {
          console.warn('[WS] Non-JSON payload received:', event.data);
        }
      };

      ws.onerror = (error) => {
        console.log('[WS] Socket error encountered:', error);
      };

      ws.onclose = (event) => {
        console.log(`[WS] Socket closed with code ${event.code}, reason: "${event.reason}"`);

        // Close Code 4001: SESSION_REPLACED (MANDATORY TERMINAL GUARD)
        if (event.code === 4001) {
          console.warn('[WS] Terminal Close Code 4001 received: Account opened on another device.');
          this.isTerminated = true;
          this.setState('terminated');
          this.clearReconnectTimer();

          if (this.sessionReplacedHandler) {
            this.sessionReplacedHandler(event.reason || 'Sesi Anda telah digantikan oleh login di perangkat baru.');
          }
          return;
        }

        // Close Code 4003: DEVICE_MISMATCH
        if (event.code === 4003) {
          console.warn('[WS] Terminal Close Code 4003 received: Device mismatch.');
          this.isTerminated = true;
          this.setState('terminated');
          this.clearReconnectTimer();
          return;
        }

        this.setState('disconnected');

        // Automatically reconnect with exponential backoff if not closed voluntarily
        if (!this.isExplicitlyClosed && !this.isTerminated) {
          this.scheduleReconnect();
        }
      };
    } catch (err) {
      console.error('[WS] Failed to instantiate WebSocket:', err);
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (this.isExplicitlyClosed || this.isTerminated) return;

    this.clearReconnectTimer();

    // Exponential backoff: 1s, 2s, 4s, 8s, 16s, up to 30s
    const backoff = Math.min(
      this.INITIAL_RECONNECT_DELAY_MS * Math.pow(2, this.reconnectAttempt),
      this.MAX_RECONNECT_DELAY_MS
    );
    this.reconnectAttempt++;

    console.log(`[WS] Scheduling reconnect attempt #${this.reconnectAttempt} in ${backoff}ms`);
    this.setState('reconnecting');

    this.reconnectTimer = setTimeout(() => {
      this.initSocket();
    }, backoff);
  }

  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }

  /**
   * Send JSON payload through WebSocket
   */
  public send(payload: any): boolean {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(typeof payload === 'string' ? payload : JSON.stringify(payload));
      return true;
    }
    console.warn('[WS] Cannot send message, socket not open');
    return false;
  }

  /**
   * Send 'join' event to subscribe to a room's realtime stream
   */
  public joinRoom(roomId: string, since?: string): boolean {
    const payload: Record<string, any> = {
      type: 'join',
      room: roomId,
    };
    if (since) {
      payload.since = since;
    }
    return this.send(payload);
  }

  /**
   * Send a chat message to a room with unique request_id
   */
  public sendMessage(roomId: string, content: string, requestId?: string): boolean {
    return this.send({
      type: 'message',
      room: roomId,
      content,
      request_id: requestId || `req_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
    });
  }

  /**
   * Send delivery or read receipt for a room
   */
  public sendReceipt(roomId: string, status: 'delivered' | 'read' = 'read'): boolean {
    return this.send({
      type: 'receipt',
      room: roomId,
      status,
    });
  }

  /**
   * Broadcast typing indicator to room participants
   */
  public sendTyping(roomId: string, isTyping = true): boolean {
    return this.send({
      type: 'typing',
      room: roomId,
      is_typing: isTyping,
    });
  }

  /**
   * Subscribe to specific event types (e.g. 'message', 'receipt', 'typing', 'system')
   */
  public on(eventType: string, listener: WebSocketEventListener): () => void {
    if (!this.listeners.has(eventType)) {
      this.listeners.set(eventType, new Set());
    }
    this.listeners.get(eventType)!.add(listener);

    return () => {
      this.listeners.get(eventType)?.delete(listener);
    };
  }

  private dispatchMessage(message: any): void {
    const type = message?.type || 'unknown';

    // Broadcast to type-specific listeners
    const typeListeners = this.listeners.get(type);
    if (typeListeners) {
      typeListeners.forEach((fn) => fn(message));
    }

    // Broadcast to wildcard '*' listeners
    const wildcardListeners = this.listeners.get('*');
    if (wildcardListeners) {
      wildcardListeners.forEach((fn) => fn(message));
    }
  }

  /**
   * Voluntary disconnect
   */
  public disconnect(): void {
    this.isExplicitlyClosed = true;
    this.clearReconnectTimer();

    if (this.ws) {
      this.ws.close(1000, 'User logged out');
      this.ws = null;
    }
    this.setState('disconnected');
  }

  /**
   * Reset termination flag to allow fresh login
   */
  public reset(): void {
    this.isTerminated = false;
    this.isExplicitlyClosed = false;
    this.reconnectAttempt = 0;
    this.clearReconnectTimer();
    this.setState('disconnected');
  }
}

export const websocketClient = new WebSocketClient();
