import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';
import WebSocket from 'ws';
const token = () => randomBytes(24).toString('hex');

async function fixture(t, persist) {
  const options = convertV4MiniflareOptions({
    name: 'zap2-test', modules: true, scriptPath: path.resolve('cloudflare/worker.mjs'),
    compatibilityDate: '2026-11-18', cf: false,
    durableObjects: { ROOMS: { className: 'ChatRoom', useSQLite: true }, GUARD: { className: 'RequestGuard', useSQLite: true } },
    resourcePersistencePath: persist, unsafeInspectDurableObjects: true,
    serviceBindings: { ASSETS: async req => {
      const name = new URL(req.url).pathname;
      if (!['/index.html', '/chat.html', '/scripts/realtime.js'].includes(name)) return new Response('Not found', { status: 404 });
      return new Response(readFileSync(path.join('public', name)));
    } },
  });
  const mf = new Miniflare(options), url = (await mf.ready).origin, clients = [];
  let closed = false;
  async function close() { if (closed) return; closed = true; for (const c of clients) c.ws.terminate(); await mf.dispose(); }
  t.after(close);
  async function room(name = 'Turma', owner = token()) {
    const response = await fetch(`${url}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, token: owner }) });
    assert.equal(response.status, 201, await response.clone().text());
    return { ...await response.json(), token: owner };
  }
  async function connect(room) {
    const ws = new WebSocket(`${url.replace('http:', 'ws:')}/api/rooms/${room.id}/socket`, { origin: url });
    const events = [], waiting = new Map(); let sequence = 0;
    ws.on('message', raw => {
      if (String(raw) === 'pong') { events.push({ event: 'pong' }); return; }
      const p = JSON.parse(String(raw));
      if (p.replyTo) { const cb = waiting.get(p.replyTo); if (cb) { waiting.delete(p.replyTo); cb(p.data); } }
      else events.push(p);
    });
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    const client = { ws, events, ack: (event, data = {}) => new Promise((resolve, reject) => {
      const id = String(++sequence), timeout = setTimeout(() => { waiting.delete(id); reject(new Error(`Timeout: ${event}`)); }, 4000);
      waiting.set(id, result => { clearTimeout(timeout); resolve(result); });
      ws.send(JSON.stringify({ event, data, id }));
    }) };
    clients.push(client); return client;
  }
  return { mf, url, room, connect, close };
}
const join = (client, room, name, who = token()) => client.ack('join', { room: room.id, name, token: who });
const send = (client, text) => client.ack('message', { text, clientId: token() });

test('Cloudflare: HTTP, assets, cliente e origem', async t => {
  const f = await fixture(t);
  assert.match(await (await fetch(f.url)).text(), /Zap 2/);
  assert.match(await (await fetch(`${f.url}/api/client.js`)).text(), /CloudRealtime/);
  assert.equal((await fetch(`${f.url}/api/health`)).status, 200);
  const bad = await fetch(`${f.url}/api/rooms`, { method: 'POST', headers: { Origin: 'https://externo.test' }, body: '{}' });
  assert.equal(bad.status, 403);
  assert.equal((await fetch(`${f.url}/api/rooms/abcdefghijklmnopqrstuvwx`)).status, 404);
  const room = await f.room();
  assert.match(await (await fetch(`${f.url}/r/${room.id}`)).text(), /api\/client.js/);
  const malformed = await fetch(`${f.url}/api/rooms`, { method: 'POST', body: 'null' });
  assert.equal(malformed.status, 400);
});

test('Cloudflare: isolamento, busca literal, presença e permissões', async t => {
  const f = await fixture(t), room = await f.room(), other = await f.room('Outra');
  const a = await f.connect(room), b = await f.connect(room), c = await f.connect(other);
  const owner = await join(a, room, 'Victor', room.token);
  await join(b, room, 'Lia'); await join(c, other, 'Fora', other.token);
  assert.equal(owner.ok, true);
  const msg = await send(a, 'Plano 100%_final <script>alert(1)</script>'); assert.equal(msg.ok, true);
  const found = await b.ack('search', { query: '100%_' }); assert.equal(found.messages.length, 1);
  assert.equal((await c.ack('search', { query: 'Plano' })).messages.length, 0);
  assert.equal((await c.ack('history')).messages.length, 0);
  assert.equal((await b.ack('delete', { id: msg.message.id })).ok, false);
  assert.equal((await c.ack('pin', { id: msg.message.id })).ok, false);
  assert.equal((await b.ack('pin', { id: msg.message.id })).ok, true);
  assert.equal((await a.ack('delete', { id: msg.message.id })).ok, true);
  const guestMsg = await send(b, 'Minha mensagem');
  assert.equal((await a.ack('delete', { id: guestMsg.message.id })).ok, true);
  assert.ok(a.events.some(e => e.event === 'presence' && e.data.length === 2));
  assert.equal(c.events.filter(e => e.event === 'message').length, 0);
});

test('Cloudflare: validação, apelidos e envio idempotente com limite', async t => {
  const f = await fixture(t), room = await f.room(), a = await f.connect(room), b = await f.connect(room);
  assert.equal((await send(a, 'Sem entrar')).ok, false);
  assert.equal((await join(a, room, 'Victor', 'short')).ok, false);
  await join(a, room, 'Victor', room.token);
  assert.equal((await join(b, room, 'victor')).ok, false);
  for (const text of ['', '  ', 'x'.repeat(2001), {}]) assert.equal((await send(a, text)).ok, false);
  const request = { text: 'Uma só', clientId: token() };
  const first = await a.ack('message', request), again = await a.ack('message', request);
  assert.equal(first.message.id, again.message.id);
  for (let i = 0; i < 7; i++) assert.equal((await send(a, String(i))).ok, true);
  assert.equal((await send(a, 'excesso')).ok, false);
  assert.equal((await a.ack('history')).messages.length, 8);
});

test('Cloudflare: mantém conexão, identidade e limite após hibernação', async t => {
  const f = await fixture(t), room = await f.room(), a = await f.connect(room);
  const first = await join(a, room, 'Victor', room.token);
  const msg = await send(a, 'Continuo aqui'); await a.ack('pin', { id: msg.message.id });
  await f.mf.unsafeEvictDurableObject('zap2-test', 'ChatRoom', { name: room.id, webSockets: 'hibernate' });
  assert.equal((await a.ack('history')).messages[0].id, msg.message.id);
  const joined = await join(a, room, 'Outro', room.token);
  assert.equal(joined.me.id, first.me.id); assert.equal(joined.me.name, 'Victor'); assert.equal(joined.pins.length, 1);
  assert.equal((await send(a, 'Depois de hibernar')).ok, true);
});

test('Cloudflare: paginação e limite de fixados', async t => {
  const f = await fixture(t), room = await f.room(), a = await f.connect(room);
  await join(a, room, 'Victor', room.token);
  const storage = await f.mf.unsafeGetDurableObjectStorage('zap2-test', 'ChatRoom', { name: room.id });
  for (let i = 0; i < 85; i++) await storage.exec('INSERT INTO messages(id,author,name,text,time,client_id) VALUES (?,?,?,?,?,?)', token(), 'seed', 'Histórico', `Mensagem ${i}`, Date.now(), token());
  const recent = await a.ack('history'); assert.equal(recent.messages.length, 80); assert.equal(recent.hasMore, true);
  const older = await a.ack('history', { before: recent.messages[0].seq });
  assert.equal(older.messages.length, 5); assert.equal(older.hasMore, false);
  assert.equal(new Set([...older.messages, ...recent.messages].map(m => m.id)).size, 85);
  for (const m of recent.messages.slice(0, 5)) assert.equal((await a.ack('pin', { id: m.id })).ok, true);
  assert.equal((await a.ack('pin', { id: recent.messages[5].id })).ok, false);
});

test('Cloudflare: histórico persiste após parar e reabrir o runtime', async t => {
  const folder = mkdtempSync(path.join(tmpdir(), 'zap2-cf-test-'));
  let f, g;
  try {
    f = await fixture(t, folder);
    const room = await f.room(), a = await f.connect(room);
    await join(a, room, 'Victor', room.token);
    const sent = await send(a, 'Não pode sumir'); await a.ack('pin', { id: sent.message.id });
    await f.close();
    g = await fixture(t, folder);
    const b = await g.connect(room), result = await join(b, room, 'Victor', room.token);
    assert.equal(result.messages[0].text, 'Não pode sumir'); assert.equal(result.pins.length, 1);
    assert.equal((await send(b, 'Voltei')).ok, true);
  } finally {
    await f?.close(); await g?.close();
    if (!path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep)) throw new Error('Pasta temporária inválida.');
    rmSync(folder, { recursive: true, force: true });
  }
});
