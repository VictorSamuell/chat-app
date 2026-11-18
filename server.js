const express = require('express');
const http = require('node:http');
const path = require('node:path');
const fs = require('node:fs');
const { randomBytes, createHash, randomUUID } = require('node:crypto');
const { DatabaseSync } = require('node:sqlite');
const { Server } = require('socket.io');

function createChatServer({ dbPath = path.join(__dirname, 'data', 'chat.sqlite') } = {}) {
  if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS rooms(id TEXT PRIMARY KEY, name TEXT NOT NULL, owner TEXT NOT NULL, created INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS members(room TEXT NOT NULL REFERENCES rooms(id), id TEXT NOT NULL, name TEXT NOT NULL, PRIMARY KEY(room,id));
    CREATE TABLE IF NOT EXISTS messages(seq INTEGER PRIMARY KEY AUTOINCREMENT, id TEXT UNIQUE NOT NULL, room TEXT NOT NULL REFERENCES rooms(id), author TEXT NOT NULL, name TEXT NOT NULL, text TEXT NOT NULL, time INTEGER NOT NULL, pinned INTEGER NOT NULL DEFAULT 0, client_id TEXT NOT NULL, UNIQUE(room,author,client_id));
    CREATE INDEX IF NOT EXISTS messages_room_seq ON messages(room,seq);`);
  const app = express();
  const server = http.createServer(app);
  const sameOrigin = req => !req.headers.origin || req.headers.origin === `${req.headers['x-forwarded-proto'] === 'https' ? 'https' : 'http'}://${req.headers.host}`;
  const io = new Server(server, { maxHttpBufferSize: 16000, allowRequest: (req, done) => done(null, sameOrigin(req)) });
  const buckets = new Map();
  const cleanup = setInterval(() => { const now = Date.now(); for (const [key, value] of buckets) if (value.until < now) buckets.delete(key); }, 60000);
  cleanup.unref();
  function allow(key, limit, window = 10000) {
    let bucket = buckets.get(key);
    if (!bucket || bucket.until < Date.now()) { bucket = { count: 0, until: Date.now() + window }; buckets.set(key, bucket); }
    return ++bucket.count <= limit;
  }
  const clean = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.trim().length <= max ? v.trim() : null;
  const identity = token => typeof token === 'string' && /^[a-zA-Z0-9_-]{32,100}$/.test(token) ? createHash('sha256').update(token).digest('hex') : null;
  const roomById = id => typeof id === 'string' ? db.prepare('SELECT * FROM rooms WHERE id=?').get(id) : null;
  const message = row => ({ id: row.id, seq: row.seq, author: row.author, name: row.name, text: row.text, time: row.time, pinned: Boolean(row.pinned) });
  const pins = room => db.prepare('SELECT * FROM messages WHERE room=? AND pinned=1 ORDER BY seq DESC').all(room).map(message);
  function history(room, before) {
    const rows = db.prepare('SELECT * FROM messages WHERE room=? AND seq<? ORDER BY seq DESC LIMIT 81').all(room, Number.isSafeInteger(before) && before > 0 ? before : Number.MAX_SAFE_INTEGER);
    return { messages: rows.slice(0, 80).reverse().map(message), hasMore: rows.length > 80 };
  }
  function presence(room) {
    const people = new Map();
    for (const socket of io.sockets.sockets.values()) if (socket.data.room === room) people.set(socket.data.user, { id: socket.data.user, name: socket.data.name });
    io.to(room).emit('presence', [...people.values()]);
  }
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    res.set({ 'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self' ws: wss:; img-src 'self' data:; object-src 'none'; base-uri 'none'; frame-ancestors 'none'" });
    next();
  });
  app.use(express.json({ limit: '8kb' }));
  app.post('/api/rooms', (req, res) => {
    if (!sameOrigin(req)) return res.status(403).json({ error: 'Origem não permitida.' });
    if (!allow(`create:${req.socket.remoteAddress}`, 20, 3600000)) return res.status(429).json({ error: 'Muitas salas criadas. Tente novamente mais tarde.' });
    const name = clean(req.body?.name, 60), owner = identity(req.body?.token);
    if (!name || !owner) return res.status(400).json({ error: 'Informe um nome de sala de até 60 caracteres.' });
    const id = randomBytes(18).toString('base64url');
    db.prepare('INSERT INTO rooms VALUES (?,?,?,?)').run(id, name, owner, Date.now());
    res.status(201).json({ id, name });
  });
  app.get('/api/rooms/:id', (req, res) => {
    const room = roomById(req.params.id);
    res.set('Cache-Control', 'no-store');
    if (!room) return res.status(404).json({ error: 'Sala não encontrada. Confira o convite.' });
    res.json({ id: room.id, name: room.name });
  });
  app.get('/api/health', (req, res) => res.json({ ok: true }));
  app.get(['/r/:id', '/chat'], (req, res) => res.sendFile(path.join(__dirname, 'public', 'chat.html')));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use((err, req, res, next) => res.status(err.status || 500).json({ error: 'Não foi possível processar a solicitação.' }));

  io.on('connection', socket => {
    function handle(event, fn, joined = true) {
      socket.on(event, async (payload, ack) => {
        const reply = typeof ack === 'function' ? ack : () => {};
        try {
          if (!allow(`socket:${socket.id}`, 100)) throw new Error('Muitas ações. Aguarde alguns segundos.');
          if (joined && !socket.data.room) throw new Error('Entre na sala novamente.');
          reply({ ok: true, ...await fn(payload || {}) });
        } catch (err) { reply({ ok: false, error: err.message }); }
      });
    }
    handle('join', async data => {
      if (!allow(`join:${socket.handshake.address}`, 60, 60000)) throw new Error('Aguarde um minuto para entrar novamente.');
      const room = roomById(data.room), user = identity(data.token), name = clean(data.name, 24);
      if (!room) throw new Error('Esta sala não existe. Confira o convite.');
      if (!user || !name) throw new Error('Escolha um apelido de até 24 caracteres.');
      const member = db.prepare('SELECT name FROM members WHERE room=? AND id=?').get(room.id, user);
      const actualName = member?.name || name;
      const occupied = db.prepare('SELECT id,name FROM members WHERE room=?').all(room.id).some(m => m.id !== user && m.name.toLocaleLowerCase('pt-BR') === actualName.toLocaleLowerCase('pt-BR'));
      if (occupied) throw new Error('Esse apelido já está em uso nesta sala. Escolha outro.');
      if (!member) db.prepare('INSERT INTO members VALUES (?,?,?)').run(room.id, user, actualName);
      const previous = socket.data.room;
      if (previous) await socket.leave(previous);
      socket.data = { room: room.id, user, name: actualName };
      await socket.join(room.id);
      if (previous && previous !== room.id) presence(previous);
      presence(room.id);
      return { room: { id: room.id, name: room.name, owner: room.owner }, me: { id: user, name: actualName }, ...history(room.id), pins: pins(room.id) };
    }, false);
    handle('message', data => {
      const { room, user, name } = socket.data;
      const text = clean(data.text, 2000), clientId = clean(data.clientId, 80);
      if (!text || !clientId) throw new Error('A mensagem deve ter entre 1 e 2.000 caracteres.');
      const existing = db.prepare('SELECT * FROM messages WHERE room=? AND author=? AND client_id=?').get(room, user, clientId);
      if (existing) return { message: message(existing) };
      if (!allow(`msg:${user}`, 8)) throw new Error('Calma aí! Aguarde alguns segundos antes de enviar mais.');
      const id = randomUUID();
      db.prepare('INSERT INTO messages(id,room,author,name,text,time,client_id) VALUES (?,?,?,?,?,?,?)').run(id, room, user, name, text, Date.now(), clientId);
      const saved = message(db.prepare('SELECT * FROM messages WHERE id=?').get(id));
      io.to(room).emit('message', saved);
      socket.to(room).emit('typing', { id: user, name, active: false });
      return { message: saved };
    });
    handle('history', data => history(socket.data.room, data.before));
    handle('search', data => {
      const query = clean(data.query, 100);
      if (!query) return { messages: [] };
      const escaped = query.replace(/[\\%_]/g, '\\$&');
      return { messages: db.prepare("SELECT * FROM messages WHERE room=? AND text LIKE ? ESCAPE '\\' ORDER BY seq DESC LIMIT 50").all(socket.data.room, `%${escaped}%`).map(message) };
    });
    handle('pin', data => {
      const row = typeof data.id === 'string' && db.prepare('SELECT * FROM messages WHERE id=? AND room=?').get(data.id, socket.data.room);
      if (!row) throw new Error('Mensagem não encontrada.');
      if (!row.pinned && pins(socket.data.room).length >= 5) throw new Error('A sala pode ter até 5 mensagens fixadas.');
      db.prepare('UPDATE messages SET pinned=? WHERE id=?').run(row.pinned ? 0 : 1, row.id);
      io.to(socket.data.room).emit('pins', pins(socket.data.room));
      return {};
    });
    handle('delete', data => {
      const row = typeof data.id === 'string' && db.prepare('SELECT * FROM messages WHERE id=? AND room=?').get(data.id, socket.data.room);
      if (!row) throw new Error('Mensagem não encontrada.');
      if (row.author !== socket.data.user && roomById(socket.data.room).owner !== socket.data.user) throw new Error('Você só pode excluir suas próprias mensagens.');
      db.prepare('DELETE FROM messages WHERE id=?').run(row.id);
      io.to(socket.data.room).emit('deleted', { id: row.id });
      io.to(socket.data.room).emit('pins', pins(socket.data.room));
      return {};
    });
    socket.on('typing', active => {
      if (socket.data.room && allow(`typing:${socket.id}`, 12)) socket.to(socket.data.room).emit('typing', { id: socket.data.user, name: socket.data.name, active: active === true });
    });
    socket.on('disconnect', () => {
      if (socket.data.room) {
        presence(socket.data.room);
        io.to(socket.data.room).emit('typing', { id: socket.data.user, active: false });
      }
    });
  });
  return { app, server, io, close: () => new Promise(resolve => { clearInterval(cleanup); io.close(() => { db.close(); resolve(); }); }) };
}

if (require.main === module) {
  const chat = createChatServer({ dbPath: process.env.DATA_PATH || undefined });
  chat.server.listen(Number(process.env.PORT) || 4000, '0.0.0.0', () => console.log(`Zap 2 disponível em http://localhost:${chat.server.address().port}`));
  for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await chat.close(); process.exit(0); });
}
module.exports = { createChatServer };
