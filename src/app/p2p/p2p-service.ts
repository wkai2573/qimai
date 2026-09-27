import { Injectable, signal } from '@angular/core';
import type { DataConnection, Peer } from 'peerjs';

import type { ConnectionStatus, NetworkRole, P2PMessage } from './p2p-types';

/** PeerJS ID 的全域命名空間前綴，避免與其他應用程式衝突 */
const PEER_PREFIX = 'qimai-v1-';

export function normalizeRoomCode(input: string): string {
  const clean = input.trim().toUpperCase();
  if (clean.startsWith('QM-')) return clean;
  if (/^\d{4}$/.test(clean)) return `QM-${clean}`;
  return clean;
}

export function generateRoomCode(): string {
  const num = Math.floor(1000 + Math.random() * 9000);
  return `QM-${num}`;
}

@Injectable({ providedIn: 'root' })
export class P2PService {
  readonly status = signal<ConnectionStatus>('idle');
  readonly role = signal<NetworkRole>(null);
  readonly roomCode = signal<string>('');
  readonly errorMessage = signal<string>('');

  private peer: Peer | null = null;
  private conn: DataConnection | null = null;
  private messageHandler: ((msg: P2PMessage) => void) | null = null;

  /** 註冊接收網路訊息的 callback */
  onMessage(handler: (msg: P2PMessage) => void): void {
    this.messageHandler = handler;
  }

  /** peerjs 只有 P2P 對戰會用到，改為動態載入以縮小初始 bundle */
  private async loadPeer(): Promise<typeof Peer> {
    try {
      return (await import('peerjs')).Peer;
    } catch (e) {
      this.errorMessage.set('載入連線模組失敗，請檢查網路後重試');
      this.status.set('error');
      throw e;
    }
  }

  /** 房主建立房間 */
  async createRoom(preferredCode?: string): Promise<string> {
    this.disconnect();
    this.status.set('hosting');
    this.errorMessage.set('');
    this.role.set('host');

    const code = preferredCode ? normalizeRoomCode(preferredCode) : generateRoomCode();
    const peerId = `${PEER_PREFIX}${code}`;
    const PeerCtor = await this.loadPeer();

    return new Promise((resolve, reject) => {
      try {
        const peer = new PeerCtor(peerId, {
          debug: 1,
        });

        this.peer = peer;

        peer.on('open', (id) => {
          this.roomCode.set(code);
          resolve(code);
        });

        peer.on('connection', (c) => {
          // 如果已有連線，關閉舊的
          if (this.conn) {
            this.conn.close();
          }
          this.conn = c;
          this.setupConnection(c);
        });

        peer.on('error', (err) => {
          const type = (err as { type?: string }).type;
          let msg = '連線伺服器發生錯誤';
          if (type === 'unavailable-id') {
            msg = `房間號碼 ${code} 已被使用，請稍後重試或重新產生`;
          } else if (err.message) {
            msg = err.message;
          }
          this.errorMessage.set(msg);
          this.status.set('error');
          reject(new Error(msg));
        });

        peer.on('disconnected', () => {
          if (this.status() === 'connected') {
            this.status.set('disconnected');
          }
        });
      } catch (e) {
        const errText = e instanceof Error ? e.message : '建立連線失敗';
        this.errorMessage.set(errText);
        this.status.set('error');
        reject(e);
      }
    });
  }

  /** 客人加入房間 */
  async joinRoom(rawCode: string): Promise<void> {
    this.disconnect();
    const code = normalizeRoomCode(rawCode);
    if (!code) {
      this.errorMessage.set('請輸入有效的房間號碼');
      this.status.set('error');
      return;
    }

    this.status.set('connecting');
    this.errorMessage.set('');
    this.role.set('guest');
    this.roomCode.set(code);

    const targetPeerId = `${PEER_PREFIX}${code}`;
    const PeerCtor = await this.loadPeer();

    return new Promise((resolve, reject) => {
      try {
        const peer = new PeerCtor({
          debug: 1,
        });

        this.peer = peer;

        peer.on('open', () => {
          const c = peer.connect(targetPeerId, {
            reliable: true,
          });
          this.conn = c;
          this.setupConnection(c);

          c.on('open', () => {
            resolve();
          });
        });

        peer.on('error', (err) => {
          const type = (err as { type?: string }).type;
          let msg = '加入房間失敗';
          if (type === 'peer-unavailable') {
            msg = `找不到房間 ${code}，請確認房主是否已建立房間`;
          } else if (err.message) {
            msg = err.message;
          }
          this.errorMessage.set(msg);
          this.status.set('error');
          reject(new Error(msg));
        });
      } catch (e) {
        const errText = e instanceof Error ? e.message : '連線失敗';
        this.errorMessage.set(errText);
        this.status.set('error');
        reject(e);
      }
    });
  }

  /** 發送訊息給對方 */
  send(msg: P2PMessage): void {
    if (this.conn && this.conn.open) {
      this.conn.send(msg);
    }
  }

  /** 關閉連線 */
  disconnect(): void {
    if (this.conn) {
      try {
        this.conn.close();
      } catch {}
      this.conn = null;
    }
    if (this.peer) {
      try {
        this.peer.destroy();
      } catch {}
      this.peer = null;
    }
    this.status.set('idle');
    this.role.set(null);
    this.roomCode.set('');
    this.errorMessage.set('');
  }

  private setupConnection(conn: DataConnection): void {
    conn.on('open', () => {
      this.status.set('connected');
      this.errorMessage.set('');
    });

    conn.on('data', (data) => {
      if (this.messageHandler && data && typeof data === 'object') {
        this.messageHandler(data as P2PMessage);
      }
    });

    conn.on('close', () => {
      this.status.set('disconnected');
    });

    conn.on('error', (err) => {
      this.errorMessage.set(err.message || '連線中斷');
      this.status.set('error');
    });
  }
}
