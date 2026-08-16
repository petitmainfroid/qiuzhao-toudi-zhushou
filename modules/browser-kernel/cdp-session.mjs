import { findPageTarget } from '../browser-session/cdp.mjs';

const MAX_MESSAGE_BYTES = 8 * 1024 * 1024;

export class CdpTargetSession {
  constructor({ port, targetId, expectedOrigin, expectedPath }) {
    this.port = port;
    this.targetId = targetId;
    this.expectedOrigin = expectedOrigin;
    this.expectedPath = expectedPath;
    this.socket = undefined;
    this.pending = new Map();
    this.sequence = 0;
  }

  async connect() {
    if (this.socket?.readyState === WebSocket.OPEN) return;
    const target = await findPageTarget(this.port, this.targetId);
    if (target.origin !== this.expectedOrigin || target.pathPattern !== this.expectedPath) {
      throw new Error('page_identity_changed');
    }
    const socket = new WebSocket(target.webSocketDebuggerUrl);
    socket.addEventListener('message', (event) => {
      const raw = String(event.data);
      if (Buffer.byteLength(raw, 'utf8') > MAX_MESSAGE_BYTES) {
        socket.close();
        this.#rejectAll(new Error('cdp_message_too_large'));
        return;
      }
      let message;
      try { message = JSON.parse(raw); } catch { return; }
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      clearTimeout(pending.timer);
      if (message.error) pending.reject(new Error('cdp_command_failed'));
      else pending.resolve(message.result ?? {});
    });
    socket.addEventListener('close', () => this.#rejectAll(new Error('cdp_disconnected')));
    socket.addEventListener('error', () => this.#rejectAll(new Error('cdp_disconnected')));
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('cdp_connect_timeout')), 3000);
      socket.addEventListener('open', () => { clearTimeout(timer); resolve(); }, { once: true });
      socket.addEventListener('error', () => { clearTimeout(timer); reject(new Error('cdp_connect_failed')); }, { once: true });
    });
    this.socket = socket;
  }

  async send(method, params = {}, timeoutMs = 15000) {
    await this.connect();
    this.sequence += 1;
    const id = this.sequence;
    return await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error('cdp_command_timeout'));
      }, Math.min(15000, Math.max(50, timeoutMs)));
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket?.close();
    this.socket = undefined;
    this.#rejectAll(new Error('cdp_disconnected'));
  }

  #rejectAll(error) {
    for (const pending of this.pending.values()) {
      clearTimeout(pending.timer);
      pending.reject(error);
    }
    this.pending.clear();
  }
}
