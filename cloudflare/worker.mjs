import { DurableObject } from 'cloudflare:workers';

const headers = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
};
const json = (value, status = 200) => new Response(JSON.stringify(value), { status, headers });
const clean = (value, max) => typeof value === 'string' && value.trim().length > 0 && value.trim().length <= max ? value.trim() : null;
const validRoom = value => /^[A-Za-z0-9_-]{24}$/.test(value || '');
const digest = async value => [...new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value)))].map(b => b.toString(16).padStart(2, '0')).join('');
const identity = async token => typeof token === 'string' && /^[a-zA-Z0-9_-]{32,100}$/.test(token) ? digest(token) : null;
class InputError extends Error {}
const requireInput = (condition, message) => { if (!condition) throw new InputError(message); };
const dto = row => ({ id: row.id, seq: row.seq, author: row.author, name: row.name, text: row.text, time: row.time, pinned: Boolean(row.pinned) });

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const origin = request.headers.get('Origin');
    const sameOrigin = !origin || origin === url.origin;
    try {
      if (url.pathname === '/api/health') return json({ ok: true, platform: 'cloudflare' });
      if (url.pathname === '/api/client.js') {
        url.pathname = '/scripts/realtime.js';
        const asset = await env.ASSETS.fetch(new Request(url, request));
        const result = new Response(asset.body, asset);
        result.headers.set('Cache-Control', 'no-store');
        return result;
      }
      if (url.pathname === '/api/rooms' && request.method === 'POST') {
        if (!sameOrigin) return json({ error: 'Origem não permitida.' }, 403);
        const raw = await request.text();
        if (raw.length > 8000) return json({ error: 'Solicitação muito grande.' }, 413);
        let body;
        try { body = JSON.parse(raw); } catch { return json({ error: 'Dados inválidos.' }, 400); }
        const name = clean(body?.name, 60), owner = await identity(body?.token);
        if (!name || !owner) return json({ error: 'Informe um nome de sala de até 60 caracteres.' }, 400);
        const ipKey = await digest(request.headers.get('CF-Connecting-IP') || 'local');
        const allowed = await env.GUARD.getByName(ipKey).allow('create', 20, 3600000);
        if (!allowed) return json({ error: 'Muitas salas criadas. Tente novamente mais tarde.' }, 429);
        const id = btoa(String.fromCharCode(...crypto.getRandomValues(new Uint8Array(18)))).replaceAll('+', '-').replaceAll('/', '_');
        return env.ROOMS.getByName(id).fetch(new Request('https://room/create', { method: 'POST', body: JSON.stringify({ id, name, owner }) }));
      }
      const match = url.pathname.match(/^\/api\/rooms\/([A-Za-z0-9_-]{24})(\/socket)?$/);
      if (match && request.method === 'GET') {
        if (match[2]) {
          if (!sameOrigin) return json({ error: 'Origem não permitida.' }, 403);
          if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket necessário.' }, 426);
          const ipKey = await digest(request.headers.get('CF-Connecting-IP') || 'local');
          if (!await env.GUARD.getByName(ipKey).allow('connect', 60, 60000)) return json({ error: 'Muitas conexões. Aguarde um minuto.' }, 429);
        }
        const target = new URL(request.url);
        target.pathname = match[2] ? '/socket' : '/meta';
        return env.ROOMS.getByName(match[1]).fetch(new Request(target, request));
      }
      if (url.pathname.startsWith('/api/')) return json({ error: 'Não encontrado.' }, 404);
      if (url.pathname === '/') url.pathname = '/index.html';
      else if (/^\/r\/[A-Za-z0-9_-]{24}\/?$/.test(url.pathname) || url.pathname === '/chat') url.pathname = '/chat.html';
      return env.ASSETS.fetch(new Request(url, request));
    } catch (error) {
      console.error('Falha no pedido:', error.name);
      return json({ error: 'Não foi possível processar a solicitação. Tente novamente.' }, 503);
    }
  },
};

// Contadores persistentes por IP, separados das salas e sem guardar o IP em texto.
export class RequestGuard extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec('CREATE TABLE IF NOT EXISTS buckets (key TEXT PRIMARY KEY, count INTEGER, expires INTEGER)');
  }
  async allow(key, max, window) {
    const now = Date.now();
    const row = this.sql.exec('SELECT * FROM buckets WHERE key=?', key).toArray()[0];
    if (row && row.expires > now && row.count >= max) return false;
    const expires = row && row.expires > now ? row.expires : now + window;
    const count = row && row.expires > now ? row.count + 1 : 1;
    this.sql.exec('INSERT OR REPLACE INTO buckets VALUES (?,?,?)', key, count, expires);
    await this.ctx.storage.setAlarm(this.sql.exec('SELECT MAX(expires) AS expiry FROM buckets').one().expiry);
    return true;
  }
  async alarm() { this.sql.exec('DELETE FROM buckets'); }
}

export class ChatRoom extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.sql = ctx.storage.sql;
    this.sql.exec(`CREATE TABLE IF NOT EXISTS room(id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, created INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS members(id TEXT PRIMARY KEY, name TEXT NOT NULL, folded TEXT UNIQUE NOT NULL);
      CREATE TABLE IF NOT EXISTS messages(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, author TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL, time INTEGER NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, client_id TEXT NOT NULL, UNIQUE(author, client_id));
      CREATE TABLE IF NOT EXISTS rates(key TEXT PRIMARY KEY, count INTEGER NOT NULL, expires INTEGER NOT NULL);`);
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
  }
  room() { return this.sql.exec('SELECT * FROM room LIMIT 1').toArray()[0]; }
  pins() { return this.sql.exec('SELECT * FROM messages WHERE pinned=1 ORDER BY seq DESC').toArray().map(dto); }
  history(before) {
    const rows = this.sql.exec('SELECT * FROM messages WHERE seq<? ORDER BY seq DESC LIMIT 81', Number.isSafeInteger(before) && before > 0 ? before : Number.MAX_SAFE_INTEGER).toArray();
    return { messages: rows.slice(0, 80).reverse().map(dto), hasMore: rows.length > 80 };
  }
  allow(key, max, window = 10000) {
    const now = Date.now();
    const row = this.sql.exec('SELECT * FROM rates WHERE key=?', key).toArray()[0];
    if (row && row.expires > now && row.count >= max) return false;
    this.sql.exec('INSERT OR REPLACE INTO rates VALUES (?,?,?)', key, row && row.expires > now ? row.count + 1 : 1, row && row.expires > now ? row.expires : now + window);
    return true;
  }
  send(ws, value) { try { ws.send(JSON.stringify(value)); } catch { /* O evento de fechamento atualiza a presença. */ } }
  broadcast(event, data, except) {
    for (const peer of this.ctx.getWebSockets()) if (peer !== except && peer.deserializeAttachment()?.user) this.send(peer, { event, data });
  }
  presence(except) {
    const people = new Map();
    for (const ws of this.ctx.getWebSockets()) {
      if (ws === except) continue;
      const data = ws.deserializeAttachment();
      if (data?.user) people.set(data.user, { id: data.user, name: data.name });
    }
    this.broadcast('presence', [...people.values()], except);
  }
  async fetch(request) {
    const url = new URL(request.url);
    if (url.pathname === '/create' && request.method === 'POST') {
      const data = await request.json();
      if (this.room()) return json({ error: 'Sala já existe.' }, 409);
      if (!validRoom(data.id) || !clean(data.name, 60) || !/^[a-f0-9]{64}$/.test(data.owner)) return json({ error: 'Sala inválida.' }, 400);
      this.sql.exec('INSERT INTO room VALUES (?,?,?,?)', data.id, data.name, data.owner, Date.now());
      return json({ id: data.id, name: data.name }, 201);
    }
    const room = this.room();
    if (!room) return json({ error: 'Sala não encontrada. Confira o convite.' }, 404);
    if (url.pathname === '/meta') return json({ id: room.id, name: room.name });
    if (url.pathname !== '/socket') return json({ error: 'Não encontrado.' }, 404);
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'WebSocket necessário.' }, 426);
    if (this.ctx.getWebSockets().length >= 100) return json({ error: 'Esta sala está cheia. Tente novamente mais tarde.' }, 429);
    const [client, server] = Object.values(new WebSocketPair());
    this.ctx.acceptWebSocket(server);
    server.serializeAttachment({ created: Date.now(), count: 0, expires: 0 });
    // Fecha conexões que não escolhem um apelido; não mantém timers em memória.
    if (await this.ctx.storage.getAlarm() === null) await this.ctx.storage.setAlarm(Date.now() + 35000);
    return new Response(null, { status: 101, webSocket: client });
  }
  async webSocketMessage(ws, raw) {
    let packet;
    try {
      requireInput(typeof raw === 'string' && raw.length <= 12000, 'Solicitação inválida ou muito grande.');
      try { packet = JSON.parse(raw); } catch { throw new InputError('Dados inválidos.'); }
      requireInput(packet && typeof packet === 'object' && typeof packet.event === 'string', 'Evento inválido.');
      requireInput(packet.id === undefined || (typeof packet.id === 'string' && packet.id.length <= 80), 'Identificador inválido.');
      const state = ws.deserializeAttachment() || { created: Date.now(), count: 0, expires: 0 };
      if (state.expires <= Date.now()) { state.count = 0; state.expires = Date.now() + 10000; }
      state.count++; ws.serializeAttachment(state);
      requireInput(state.count <= 100, 'Muitas ações. Aguarde alguns segundos.');
      const data = packet.data ?? {};
      const room = this.room();
      let result = {};
      if (packet.event === 'join') {
        const user = await identity(data.token), name = clean(data.name, 24);
        requireInput(user && name && data.room === room.id, 'Confira a sala e escolha um apelido de até 24 caracteres.');
        requireInput(!state.user || state.user === user, 'Reconecte para trocar de identidade.');
        const member = this.sql.exec('SELECT * FROM members WHERE id=?', user).toArray()[0];
        const actualName = member?.name || name, folded = actualName.toLocaleLowerCase('pt-BR');
        const occupied = this.sql.exec('SELECT id FROM members WHERE folded=?', folded).toArray()[0];
        requireInput(!occupied || occupied.id === user, 'Esse apelido já está em uso nesta sala. Escolha outro.');
        if (!member) this.sql.exec('INSERT INTO members VALUES (?,?,?)', user, actualName, folded);
        ws.serializeAttachment({ ...state, user, name: actualName });
        result = { room: { id: room.id, name: room.name, owner: room.owner }, me: { id: user, name: actualName }, ...this.history(), pins: this.pins() };
        this.presence();
      } else {
        requireInput(state.user, 'Entre na sala novamente.');
        switch (packet.event) {
          case 'message': {
            const text = clean(data.text, 2000), clientId = clean(data.clientId, 80);
            requireInput(text && clientId, 'A mensagem deve ter entre 1 e 2.000 caracteres.');
            const previous = this.sql.exec('SELECT * FROM messages WHERE author=? AND client_id=?', state.user, clientId).toArray()[0];
            if (previous) { result = { message: dto(previous) }; break; }
            requireInput(this.allow(`msg:${state.user}`, 8), 'Calma aí! Aguarde alguns segundos antes de enviar mais.');
            const id = crypto.randomUUID();
            this.sql.exec('INSERT INTO messages(id,author,name,text,time,client_id) VALUES (?,?,?,?,?,?)', id, state.user, state.name, text, Date.now(), clientId);
            const saved = dto(this.sql.exec('SELECT * FROM messages WHERE id=?', id).one());
            this.broadcast('message', saved); this.broadcast('typing', { id: state.user, active: false }, ws);
            result = { message: saved }; break;
          }
          case 'history': result = this.history(data.before); break;
          case 'search': {
            const query = clean(data.query, 100);
            const pattern = query?.replace(/[\\%_]/g, '\\$&');
            result = { messages: query ? this.sql.exec("SELECT * FROM messages WHERE text LIKE ? ESCAPE '\\' ORDER BY seq DESC LIMIT 50", `%${pattern}%`).toArray().map(dto) : [] }; break;
          }
          case 'pin': {
            const row = typeof data.id === 'string' && this.sql.exec('SELECT * FROM messages WHERE id=?', data.id).toArray()[0];
            requireInput(row, 'Mensagem não encontrada.');
            requireInput(row.pinned || this.pins().length < 5, 'A sala pode ter até 5 mensagens fixadas.');
            this.sql.exec('UPDATE messages SET pinned=? WHERE id=?', row.pinned ? 0 : 1, row.id);
            this.broadcast('pins', this.pins()); break;
          }
          case 'delete': {
            const row = typeof data.id === 'string' && this.sql.exec('SELECT * FROM messages WHERE id=?', data.id).toArray()[0];
            requireInput(row, 'Mensagem não encontrada.');
            requireInput(row.author === state.user || room.owner === state.user, 'Você só pode excluir suas próprias mensagens.');
            this.sql.exec('DELETE FROM messages WHERE id=?', row.id);
            this.broadcast('deleted', { id: row.id }); this.broadcast('pins', this.pins()); break;
          }
          case 'typing':
            if (!state.lastTyping || Date.now() - state.lastTyping > 500 || data === false) {
              state.lastTyping = Date.now(); ws.serializeAttachment(state);
              this.broadcast('typing', { id: state.user, name: state.name, active: data === true }, ws);
            }
            break;
          default: throw new InputError('Evento desconhecido.');
        }
      }
      if (packet.id) this.send(ws, { replyTo: packet.id, data: { ok: true, ...result } });
    } catch (error) {
      if (packet?.id && typeof packet.id === 'string' && packet.id.length <= 80) this.send(ws, { replyTo: packet.id, data: { ok: false, error: error instanceof InputError ? error.message : 'Não foi possível concluir. Tente novamente.' } });
      if (!(error instanceof InputError)) console.error('Falha no evento:', error.name);
    }
  }
  webSocketClose(ws, code, reason) {
    const state = ws.deserializeAttachment();
    if (code >= 1000 && code < 5000 && ![1004, 1005, 1006, 1015].includes(code)) ws.close(code, reason);
    else ws.close();
    if (state?.user) { this.presence(ws); this.broadcast('typing', { id: state.user, active: false }, ws); }
  }
  webSocketError(ws) { try { ws.close(1011, 'Reconecte para continuar.'); } catch {} this.presence(ws); }
  async alarm() {
    let next;
    for (const ws of this.ctx.getWebSockets()) {
      const state = ws.deserializeAttachment();
      if (state?.user) continue;
      const expires = (state?.created || 0) + 30000;
      if (expires <= Date.now()) ws.close(1008, 'Escolha um apelido para entrar.');
      else next = Math.min(next ?? Infinity, expires);
    }
    this.sql.exec('DELETE FROM rates WHERE expires<?', Date.now());
    if (next) await this.ctx.storage.setAlarm(next + 1000);
  }
}
