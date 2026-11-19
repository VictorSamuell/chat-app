/* Adaptador de eventos usado apenas no deploy Cloudflare. O Node continua usando Socket.IO. */
(() => {
  class CloudRealtime {
    constructor({ autoConnect = true } = {}) {
      this.connected = false;
      this.handlers = new Map();
      this.pending = new Map();
      this.sequence = 0;
      this.attempts = 0;
      this.wanted = false;
      window.addEventListener('online', () => { if (this.wanted && !this.connected) { clearTimeout(this.retry); this.connect(); } });
      window.addEventListener('pagehide', () => { this.wasActive = this.wanted; this.disconnect(); });
      window.addEventListener('pageshow', () => { if (this.wasActive) this.connect(); });
      if (autoConnect) queueMicrotask(() => this.connect());
    }
    on(event, listener) {
      if (!this.handlers.has(event)) this.handlers.set(event, new Set());
      this.handlers.get(event).add(listener);
      return this;
    }
    dispatch(event, data) { for (const listener of this.handlers.get(event) || []) listener(data); }
    connect() {
      this.wanted = true;
      if (this.ws && this.ws.readyState < 2) return this;
      clearTimeout(this.retry);
      const room = location.pathname.match(/^\/r\/([A-Za-z0-9_-]{24})\/?$/)?.[1];
      if (!room) { this.dispatch('connect_error', new Error('Sala inválida.')); return this; }
      const url = new URL(`/api/rooms/${room}/socket`, location.origin);
      url.protocol = location.protocol === 'https:' ? 'wss:' : 'ws:';
      const ws = new WebSocket(url);
      this.ws = ws;
      const opening = setTimeout(() => { if (ws.readyState === WebSocket.CONNECTING) ws.close(); }, 10000);
      ws.addEventListener('open', () => {
        if (this.ws !== ws) return;
        clearTimeout(opening); this.connected = true; this.attempts = 0; this.lastAlive = Date.now();
        this.heartbeat = setInterval(() => {
          if (Date.now() - this.lastAlive > 65000) { ws.close(); return; }
          if (ws.readyState === WebSocket.OPEN) ws.send('ping');
        }, 25000);
        this.dispatch('connect');
      });
      ws.addEventListener('message', event => {
        if (this.ws !== ws) return;
        this.lastAlive = Date.now();
        if (event.data === 'pong') return;
        let packet;
        try { packet = JSON.parse(event.data); } catch { return; }
        if (packet.replyTo) {
          const pending = this.pending.get(packet.replyTo);
          if (pending) { clearTimeout(pending.timer); this.pending.delete(packet.replyTo); pending.callback(null, packet.data); }
        } else if (packet.event) this.dispatch(packet.event, packet.data);
      });
      ws.addEventListener('error', () => { if (this.ws === ws) this.dispatch('connect_error', new Error('Não foi possível conectar.')); });
      ws.addEventListener('close', () => {
        clearTimeout(opening);
        if (this.ws !== ws) return;
        clearInterval(this.heartbeat);
        const wasConnected = this.connected; this.connected = false;
        for (const item of this.pending.values()) { clearTimeout(item.timer); item.callback(new Error('Conexão interrompida.')); }
        this.pending.clear();
        if (wasConnected) this.dispatch('disconnect');
        else this.dispatch('connect_error', new Error('Servidor indisponível. Tentando novamente.'));
        if (this.wanted) {
          const delay = Math.min(15000, 700 * 2 ** Math.min(this.attempts++, 5)) + Math.random() * 300;
          this.retry = setTimeout(() => this.connect(), delay);
        }
      });
      return this;
    }
    disconnect() {
      this.wanted = false;
      clearTimeout(this.retry); clearInterval(this.heartbeat);
      this.ws?.close(1000, 'Saindo da conversa');
      return this;
    }
    timeout(milliseconds) { return { emit: (event, data, callback) => this.emit(event, data, callback, milliseconds) }; }
    emit(event, data, callback, milliseconds = 10000) {
      if (!this.connected || this.ws?.readyState !== WebSocket.OPEN) { callback?.(new Error('Sem conexão.')); return this; }
      const packet = { event, data };
      if (typeof callback === 'function') {
        packet.id = String(++this.sequence);
        const timer = setTimeout(() => { this.pending.delete(packet.id); callback(new Error('A confirmação demorou.')); }, milliseconds);
        this.pending.set(packet.id, { callback, timer });
      }
      try { this.ws.send(JSON.stringify(packet)); }
      catch (error) {
        const item = this.pending.get(packet.id);
        if (item) { clearTimeout(item.timer); this.pending.delete(packet.id); item.callback(error); }
      }
      return this;
    }
  }
  window.io = options => new CloudRealtime(options);
})();
