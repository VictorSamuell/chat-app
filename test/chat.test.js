const { test } = require('node:test');
const assert = require('node:assert/strict');
const { io } = require('socket.io-client');
const { randomBytes } = require('node:crypto');
const { mkdtempSync, rmSync } = require('node:fs');
const { tmpdir } = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');
const { createChatServer } = require('../server');
const token = () => randomBytes(24).toString('hex');
const ack = (socket, event, data) => socket.timeout(3000).emitWithAck(event, data);
async function fixture(t, dbPath = ':memory:') {
  const app = createChatServer({ dbPath });
  await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
  const url = `http://127.0.0.1:${app.server.address().port}`, clients = [];
  let closed = false;
  const close = async () => { if (closed) return; closed = true; for (const client of clients) client.disconnect(); await app.close(); };
  t.after(close);
  async function connect(transport = 'websocket') {
    const socket = io(url, { transports: [transport], forceNew: true, reconnection: false }); clients.push(socket);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('connect_error', reject); }); return socket;
  }
  async function room(name = 'Turma', owner = token()) {
    const response = await fetch(`${url}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name, token: owner }) });
    assert.equal(response.status, 201); return { ...await response.json(), token: owner };
  }
  return { app, url, connect, room, close };
}

test('salas isoladas; envio por WebSocket e polling; busca literal e HTML tratado como texto', async t => {
  const f = await fixture(t), a = await f.room('Amigos'), b = await f.room('Outra sala');
  const alice = await f.connect(), bob = await f.connect('polling'), outsider = await f.connect();
  assert.equal((await ack(alice, 'join', { room: a.id, token: a.token, name: 'Alice' })).ok, true);
  await ack(bob, 'join', { room: a.id, token: token(), name: 'Bob' });
  await ack(outsider, 'join', { room: b.id, token: b.token, name: 'Carla' });
  let leaked = false; outsider.on('message', () => { leaked = true; });
  const reception = new Promise(resolve => bob.once('message', resolve));
  const sent = await ack(alice, 'message', { text: '<img onerror=alert(1)> plano 100%_final', clientId: token() });
  assert.equal(sent.ok, true); assert.equal((await reception).id, sent.message.id);
  assert.equal((await ack(bob, 'search', { query: '100%_' })).messages.length, 1);
  assert.equal((await ack(bob, 'search', { query: '100x' })).messages.length, 0);
  assert.equal((await ack(outsider, 'search', { query: 'plano' })).messages.length, 0);
  assert.equal((await ack(outsider, 'history', {})).messages.length, 0);
  assert.equal(leaked, false);
});

test('validação, apelidos reservados e limites de envio com repetição idempotente', async t => {
  const f = await fixture(t), room = await f.room(), client = await f.connect(), second = await f.connect();
  assert.equal((await ack(client, 'message', { text: 'oi', clientId: token() })).ok, false);
  assert.equal((await ack(client, 'join', { room: room.id, token: 'short', name: 'A' })).ok, false);
  await ack(client, 'join', { room: room.id, token: room.token, name: 'Alice' });
  assert.equal((await ack(second, 'join', { room: room.id, token: token(), name: 'alice' })).ok, false);
  for (const text of ['', '   ', 'x'.repeat(2001), { bad: true }]) assert.equal((await ack(client, 'message', { text, clientId: token() })).ok, false);
  const payload = { text: 'Uma só', clientId: token() };
  const first = await ack(client, 'message', payload), again = await ack(client, 'message', payload);
  assert.equal(first.message.id, again.message.id);
  for (let i = 0; i < 7; i++) assert.equal((await ack(client, 'message', { text: `Teste ${i}`, clientId: token() })).ok, true);
  assert.equal((await ack(client, 'message', { text: 'Excesso', clientId: token() })).ok, false);
  assert.equal((await ack(client, 'history', {})).messages.length, 8);
});

test('fixados e exclusão respeitam sala, autoria e moderação do criador', async t => {
  const f = await fixture(t), room = await f.room(), other = await f.room();
  const owner = await f.connect(), guest = await f.connect(), stranger = await f.connect();
  await ack(owner, 'join', { room: room.id, name: 'Dono', token: room.token });
  await ack(guest, 'join', { room: room.id, name: 'Visita', token: token() });
  await ack(stranger, 'join', { room: other.id, name: 'Fora', token: token() });
  const ids = [];
  for (let i = 0; i < 6; i++) ids.push((await ack(owner, 'message', { text: `Plano ${i}`, clientId: token() })).message.id);
  for (const id of ids.slice(0, 5)) assert.equal((await ack(guest, 'pin', { id })).ok, true);
  assert.equal((await ack(guest, 'pin', { id: ids[5] })).ok, false);
  assert.equal((await ack(stranger, 'pin', { id: ids[0] })).ok, false);
  assert.equal((await ack(guest, 'delete', { id: ids[0] })).ok, false);
  assert.equal((await ack(stranger, 'delete', { id: ids[0] })).ok, false);
  assert.equal((await ack(owner, 'delete', { id: ids[0] })).ok, true);
  const guestMessage = await ack(guest, 'message', { text: 'Moderável', clientId: token() });
  assert.equal((await ack(owner, 'delete', { id: guestMessage.message.id })).ok, true);
  const ownMessage = await ack(guest, 'message', { text: 'Minha', clientId: token() });
  assert.equal((await ack(guest, 'delete', { id: ownMessage.message.id })).ok, true);
});

test('identidade, histórico e fixados sobrevivem à reinicialização', async t => {
  const folder = mkdtempSync(path.join(tmpdir(), 'papo-test-'));
  const dbPath = path.join(folder, 'chat.sqlite');
  try {
    const f = await fixture(t, dbPath), room = await f.room('Persistência'), client = await f.connect();
    const joined = await ack(client, 'join', { room: room.id, token: room.token, name: 'Alice' });
    const sent = await ack(client, 'message', { text: 'Volto já', clientId: token() });
    await ack(client, 'pin', { id: sent.message.id }); await f.close();
    const g = await fixture(t, dbPath), reconnected = await g.connect();
    const result = await ack(reconnected, 'join', { room: room.id, token: room.token, name: 'Outro nome' });
    assert.equal(result.me.id, joined.me.id); assert.equal(result.me.name, 'Alice');
    assert.equal(result.messages[0].text, 'Volto já'); assert.equal(result.pins.length, 1);
    assert.equal((await ack(reconnected, 'message', { text: 'Voltei', clientId: token() })).ok, true);
    await g.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('histórico paginado sem lacunas ou duplicação', async t => {
  const folder = mkdtempSync(path.join(tmpdir(), 'papo-page-')), dbPath = path.join(folder, 'chat.sqlite');
  try {
    const f = await fixture(t, dbPath), room = await f.room(), client = await f.connect();
    const db = new DatabaseSync(dbPath), insert = db.prepare('INSERT INTO messages(id,room,author,name,text,time,client_id) VALUES (?,?,?,?,?,?,?)');
    for (let i = 0; i < 85; i++) insert.run(token(), room.id, 'seed', 'Histórico', `Mensagem ${i}`, Date.now(), token());
    db.close();
    const joined = await ack(client, 'join', { room: room.id, token: room.token, name: 'Alice' });
    assert.equal(joined.messages.length, 80); assert.equal(joined.hasMore, true);
    const older = await ack(client, 'history', { before: joined.messages[0].seq });
    assert.equal(older.messages.length, 5); assert.equal(older.hasMore, false);
    assert.equal(new Set([...older.messages, ...joined.messages].map(m => m.id)).size, 85);
    await f.close();
  } finally { rmSync(folder, { recursive: true, force: true }); }
});

test('HTTP entrega aplicação, bloqueia origem indevida e rejeita sala inválida', async t => {
  const f = await fixture(t);
  const page = await fetch(f.url); assert.equal(page.status, 200); assert.match(page.headers.get('content-security-policy'), /default-src 'self'/);
  assert.match(await page.text(), /Zap 2/);
  const bad = await fetch(`${f.url}/api/rooms`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://outro.example' }, body: JSON.stringify({ name: 'Sala', token: token() }) });
  assert.equal(bad.status, 403);
  assert.equal((await fetch(`${f.url}/api/rooms/nao-existe`)).status, 404);
  const client = await f.connect(); assert.equal((await ack(client, 'join', { room: 'nao-existe', token: token(), name: 'Alice' })).ok, false);
});
