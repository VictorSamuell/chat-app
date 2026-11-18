const $ = selector => document.querySelector(selector);
const { el, read, write, token, newId, remember, recent, avatar, toast } = Papo;
const roomId = location.pathname.match(/^\/r\/([A-Za-z0-9_-]{24})\/?$/)?.[1];
const socket = io({ autoConnect: false });
let me, room, ready = false, joining = false, hasMore = false, pinned = [], pendingSend, sending = false;
let messages = new Map(), typing = new Map(), searchRows = [], unread = 0, lastTyping = 0, typingTimer, deleteId;
const input = $('#message-input');
const timeline = $('#timeline');
const joinDialog = $('#join-dialog');
const timeFormat = new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' });
const dateFormat = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });
const request = (event, data) => new Promise((resolve, reject) => {
  if (!socket.connected) return reject(new Error('Sem conexão. Sua mensagem continua aqui.'));
  socket.timeout(10000).emit(event, data, (err, result) => {
    if (err) reject(new Error('A confirmação demorou. Tente novamente; a mensagem não será duplicada.'));
    else if (!result?.ok) reject(new Error(result?.error || 'Não foi possível concluir.'));
    else resolve(result);
  });
});
function setReady(value) {
  ready = value;
  input.disabled = !value; $('#emoji-button').disabled = !value;
  $('#send-button').disabled = !value || sending || !input.value.trim();
  input.placeholder = value ? 'Escreva uma mensagem…' : 'Reconectando… seu rascunho está salvo.';
  $('#connection-status').textContent = value ? 'Conectado' : 'Reconectando…';
  $('#connection-dot').classList.toggle('offline', !value);
}
function title() { document.title = `${unread ? `(${unread}) ` : ''}${room?.name || 'Sala'} · Zap 2`; }
function bottom() { timeline.scrollTop = timeline.scrollHeight; $('#new-messages').hidden = true; }
function nearBottom() { return timeline.scrollHeight - timeline.scrollTop - timeline.clientHeight < 100; }
function showJoin(error = '') { $('#join-error').textContent = error; $('#join-name').value = read('papo.nickname', ''); if (!joinDialog.open) joinDialog.showModal(); }
joinDialog.addEventListener('cancel', e => { e.preventDefault(); location.assign('/'); });
function renderNav() {
  $('#room-nav').replaceChildren();
  for (const item of recent()) {
    const link = el('a', `room-nav-item${item.id === roomId ? ' active' : ''}`); link.href = `/r/${item.id}`;
    if (item.id === roomId) link.setAttribute('aria-current', 'page');
    link.append(el('span', '', '#'), el('span', '', item.name)); $('#room-nav').append(link);
  }
}
function textWithLinks(text) {
  const fragment = document.createDocumentFragment();
  for (const part of text.split(/(https?:\/\/[^\s<>]+)/g)) {
    if (/^https?:\/\//.test(part)) {
      try { const url = new URL(part); if (!['http:', 'https:'].includes(url.protocol)) throw new Error(); const link = el('a', '', part); link.href = url.href; link.target = '_blank'; link.rel = 'noopener noreferrer'; fragment.append(link); }
      catch { fragment.append(document.createTextNode(part)); }
    } else fragment.append(document.createTextNode(part));
  }
  return fragment;
}
function action(label, fn) { const button = el('button', '', label); button.type = 'button'; button.addEventListener('click', fn); return button; }
async function togglePin(id) { try { await request('pin', { id }); } catch (err) { toast(err.message, true); } }
function renderMessages() {
  const container = $('#messages'), fragment = document.createDocumentFragment();
  let day;
  for (const msg of [...messages.values()].sort((a, b) => a.seq - b.seq)) {
    const currentDay = dateFormat.format(msg.time);
    if (currentDay !== day) { day = currentDay; fragment.append(el('div', 'date-divider', day)); }
    const own = msg.author === me?.id, row = el('article', `message-row${own ? ' own' : ''}`); row.id = `m-${msg.id}`;
    const content = el('div', 'message-content'), meta = el('div', 'message-meta');
    const when = el('time', '', timeFormat.format(msg.time)); when.dateTime = new Date(msg.time).toISOString(); when.title = `${currentDay}, ${when.textContent}`;
    meta.append(el('strong', '', own ? 'Você' : msg.name));
    if (msg.author === room?.owner) meta.append(el('span', 'owner-badge', 'criador'));
    meta.append(when);
    const bubble = el('div', 'message-bubble'); bubble.append(textWithLinks(msg.text));
    const actions = el('div', 'message-actions');
    const isPinned = pinned.some(p => p.id === msg.id);
    actions.append(action(isPinned ? '⌖ Desafixar' : '⌖ Fixar', () => togglePin(msg.id)));
    if (own || me?.id === room?.owner) actions.append(action('Excluir', () => { deleteId = msg.id; $('#delete-dialog').showModal(); }));
    content.append(meta, bubble, actions); row.append(avatar(msg.name, msg.author), content); fragment.append(row);
  }
  container.replaceChildren(fragment);
  $('#empty-state').hidden = messages.size > 0;
  $('#load-older').hidden = !hasMore;
}
function addMessage(msg) {
  const exists = messages.has(msg.id), scroll = nearBottom();
  messages.set(msg.id, msg); renderMessages();
  if (scroll || msg.author === me?.id) bottom(); else if (!exists) $('#new-messages').hidden = false;
  if (!exists && msg.author !== me?.id && document.hidden) { unread++; title(); }
}
function renderPins() {
  $('#pin-count').textContent = `${pinned.length} / 5`;
  $('#pin-strip').hidden = !pinned.length;
  $('#show-pins').textContent = pinned.length ? `${pinned.length} fixada${pinned.length > 1 ? 's' : ''} · ${pinned[0].text}` : '';
  const list = $('#pinned-messages'); list.replaceChildren();
  if (!pinned.length) list.append(el('div', 'pinned-empty', 'Um link importante? Um plano combinado? Fixe uma mensagem para encontrar aqui.'));
  for (const msg of pinned) {
    const card = el('article', 'pinned-card'); card.append(el('strong', '', `⌖ ${msg.name}`), el('p', '', msg.text), action('Desafixar', () => togglePin(msg.id))); list.append(card);
  }
}
function renderPeople(people) {
  $('#participants').replaceChildren(); $('#people-count').textContent = people.length; $('#online-button').textContent = `${people.length} online`;
  for (const person of people) { const row = el('li'); row.append(avatar(person.name, person.id), el('strong', '', person.name)); if (person.id === me?.id) row.append(el('small', '', 'você')); row.append(el('span', 'status-dot')); $('#participants').append(row); }
}
let people = [];
async function join(name) {
  if (joining) return;
  joining = true; $('#join-submit').disabled = true;
  try {
    const result = await request('join', { room: roomId, name, token });
    room = result.room; me = result.me; pinned = result.pins; messages = new Map(result.messages.map(m => [m.id, m])); hasMore = result.hasMore;
    write('papo.nickname', me.name); remember(room); renderNav();
    $('#room-title').textContent = room.name; $('#welcome-title').textContent = room.name;
    $('#my-name').textContent = me.name; $('#my-avatar').replaceWith(Object.assign(avatar(me.name, me.id), { id: 'my-avatar' }));
    title(); renderMessages(); renderPins(); renderPeople(people); setReady(true); joining = false;
    if (joinDialog.open) joinDialog.close(); bottom();
    if (!matchMedia('(max-width: 620px)').matches) input.focus();
    if (!$('#search-panel').hidden && $('#search-input').value.trim()) await search();
  } catch (err) { setReady(false); if (socket.connected) { $('#connection-status').textContent = 'Escolha seu apelido'; showJoin(err.message); } }
  finally { joining = false; $('#join-submit').disabled = false; }
}
socket.on('connect', () => { joining = false; const name = read('papo.nickname', ''); if (name) join(name); else { $('#connection-status').textContent = 'Escolha seu apelido'; showJoin(); } });
socket.on('disconnect', () => { setReady(false); typing.clear(); people = []; renderPeople(people); updateTyping(); });
socket.on('connect_error', () => { setReady(false); $('#connection-status').textContent = 'Sem conexão · tentando novamente'; });
socket.on('message', addMessage);
socket.on('presence', value => { people = value; renderPeople(people); });
socket.on('pins', value => { pinned = value; const scroll = timeline.scrollTop; renderPins(); renderMessages(); renderSearch(); timeline.scrollTop = scroll; });
socket.on('deleted', ({ id }) => { messages.delete(id); searchRows = searchRows.filter(m => m.id !== id); const scroll = timeline.scrollTop; renderMessages(); renderSearch(); timeline.scrollTop = scroll; });
socket.on('typing', person => { if (person.active) typing.set(person.id, { name: person.name, until: Date.now() + 4000 }); else typing.delete(person.id); updateTyping(); });
function updateTyping() { for (const [id, person] of typing) if (person.until < Date.now()) typing.delete(id); const names = [...typing.values()].map(p => p.name); $('#typing-indicator').textContent = names.length ? `${names.slice(0, 2).join(' e ')}${names.length > 2 ? ' e mais gente' : ''} ${names.length === 1 ? 'está digitando' : 'estão digitando'}…` : ''; }
setInterval(updateTyping, 1000);
$('#join-form').addEventListener('submit', e => { e.preventDefault(); const name = $('#join-name').value.trim(); if (!name) { $('#join-error').textContent = 'Escolha um apelido.'; return; } if (!socket.connected) { $('#join-error').textContent = 'Sem conexão com o servidor. Aguarde a reconexão.'; return; } write('papo.nickname', name); join(name); });
function resizeInput() { input.style.height = 'auto'; input.style.height = `${Math.min(input.scrollHeight, 145)}px`; $('#character-count').textContent = `${input.value.length} / 2000`; $('#send-button').disabled = !ready || sending || !input.value.trim(); }
input.addEventListener('input', () => {
  write(`papo.draft.${roomId}`, input.value); resizeInput();
  if (ready && Date.now() - lastTyping > 1400) { socket.emit('typing', Boolean(input.value.trim())); lastTyping = Date.now(); }
  clearTimeout(typingTimer); typingTimer = setTimeout(() => { if (socket.connected) socket.emit('typing', false); }, 1800);
});
input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); $('#chat-form').requestSubmit(); } });
$('#chat-form').addEventListener('submit', async e => {
  e.preventDefault(); const text = input.value.trim(); if (!ready || !text || sending) return;
  if (!pendingSend || pendingSend.text !== text) pendingSend = { text, clientId: newId() };
  const draftAtSend = input.value;
  sending = true; resizeInput();
  try { const result = await request('message', pendingSend); addMessage(result.message); if (input.value === draftAtSend) { input.value = ''; write(`papo.draft.${roomId}`, ''); } pendingSend = null; socket.emit('typing', false); }
  catch (err) { toast(err.message, true); }
  finally { sending = false; resizeInput(); input.focus(); }
});
$('#load-older').addEventListener('click', async () => {
  const button = $('#load-older'); button.disabled = true;
  try { const before = Math.min(...[...messages.values()].map(m => m.seq)); const result = await request('history', { before }); const height = timeline.scrollHeight, top = timeline.scrollTop; for (const msg of result.messages) messages.set(msg.id, msg); hasMore = result.hasMore; renderMessages(); timeline.scrollTop = top + timeline.scrollHeight - height; }
  catch (err) { toast(err.message, true); } finally { button.disabled = false; }
});
$('#new-messages').addEventListener('click', bottom);
timeline.addEventListener('scroll', () => { if (nearBottom()) $('#new-messages').hidden = true; });
document.addEventListener('visibilitychange', () => { if (!document.hidden) { unread = 0; title(); } });
function details(open = true) { $('#details-panel').classList.toggle('open', open); $('#details-panel').classList.toggle('closed', !open); $('#details-toggle').setAttribute('aria-expanded', open); }
$('#details-toggle').addEventListener('click', () => details(getComputedStyle($('#details-panel')).display === 'none'));
$('#close-details').addEventListener('click', () => details(false)); $('#online-button').addEventListener('click', () => details()); $('#show-pins').addEventListener('click', () => details());
function sidebar(open) { $('#sidebar').classList.toggle('open', open); $('#sidebar-scrim').hidden = !open; $('#open-sidebar').setAttribute('aria-expanded', open); }
$('#open-sidebar').addEventListener('click', () => sidebar(true)); $('#close-sidebar').addEventListener('click', () => sidebar(false)); $('#sidebar-scrim').addEventListener('click', () => sidebar(false));
function invite() { $('#invite-link').value = `${location.origin}/r/${roomId}`; $('#invite-dialog').showModal(); }
$('#invite-button').addEventListener('click', invite); $('#sidebar-invite').addEventListener('click', invite); $('#close-invite').addEventListener('click', () => $('#invite-dialog').close());
$('#copy-invite').addEventListener('click', async () => { const field = $('#invite-link'); try { if (!navigator.clipboard) throw new Error(); await navigator.clipboard.writeText(field.value); toast('Convite copiado. Chama a turma!'); $('#invite-dialog').close(); } catch { field.focus(); field.select(); toast('Selecione e copie o link com Ctrl+C ou pelo menu do celular.'); } });
$('#cancel-delete').addEventListener('click', () => $('#delete-dialog').close());
$('#confirm-delete').addEventListener('click', async () => { const button = $('#confirm-delete'); button.disabled = true; try { await request('delete', { id: deleteId }); $('#delete-dialog').close(); toast('Mensagem excluída.'); } catch (err) { toast(err.message, true); } finally { button.disabled = false; } });
$('#emoji-button').addEventListener('click', () => { $('#emoji-picker').hidden = !$('#emoji-picker').hidden; });
for (const emoji of ['😀', '😂', '🥹', '😍', '😎', '👀', '🙌', '👍', '❤️', '🔥', '✨', '🎉', '🤔', '🤝', '🚀']) $('#emoji-picker').append(action(emoji, () => { if (input.value.length + emoji.length <= 2000) { input.setRangeText(emoji, input.selectionStart, input.selectionEnd, 'end'); input.dispatchEvent(new Event('input')); } $('#emoji-picker').hidden = true; input.focus(); }));
let searchVersion = 0;
function renderSearch() {
  const box = $('#search-results'); box.replaceChildren();
  if (!$('#search-input').value.trim()) return;
  box.append(el('p', 'search-result', `${searchRows.length}${searchRows.length === 50 ? ' (limite de 50)' : ''} resultado${searchRows.length === 1 ? '' : 's'}`));
  for (const msg of searchRows) { const row = el('article', 'search-result'); row.append(el('strong', '', msg.name), el('p', '', msg.text), el('small', '', `${dateFormat.format(msg.time)} · ${timeFormat.format(msg.time)} `), action(pinned.some(p => p.id === msg.id) ? 'Desafixar' : 'Fixar', () => togglePin(msg.id))); box.append(row); }
}
async function search() { const query = $('#search-input').value.trim(), version = ++searchVersion; if (!query) { searchRows = []; renderSearch(); return; } $('#search-results').textContent = 'Buscando…'; try { const result = await request('search', { query }); if (version !== searchVersion) return; searchRows = result.messages; renderSearch(); } catch (err) { if (version === searchVersion) $('#search-results').textContent = err.message; } }
$('#search-toggle').addEventListener('click', () => { $('#search-panel').hidden = !$('#search-panel').hidden; if (!$('#search-panel').hidden) $('#search-input').focus(); });
$('#close-search').addEventListener('click', () => { $('#search-panel').hidden = true; });
$('#search-form').addEventListener('submit', e => { e.preventDefault(); search(); });
$('#search-input').addEventListener('input', () => { searchVersion++; if (!$('#search-input').value.trim()) { searchRows = []; renderSearch(); } });
document.addEventListener('keydown', e => { if (e.key === 'Escape') { sidebar(false); $('#emoji-picker').hidden = true; $('#search-panel').hidden = true; if (matchMedia('(max-width:1150px)').matches) details(false); } });
(async () => {
  if (!roomId) { location.replace('/'); return; }
  renderNav(); renderPins();
  input.value = read(`papo.draft.${roomId}`, ''); resizeInput();
  try {
    const response = await fetch(`/api/rooms/${roomId}`); const result = await response.json(); if (!response.ok) throw new Error(result.error);
    room = result; $('#room-title').textContent = room.name; $('#welcome-title').textContent = room.name; $('#join-description').textContent = `Escolha seu apelido para entrar em “${room.name}”.`; title(); socket.connect();
  } catch (err) { $('#room-title').textContent = 'Não foi possível abrir a sala'; $('#connection-status').textContent = 'Sala indisponível'; showJoin(err.message); $('#join-name').disabled = true; $('#join-submit').disabled = true; }
})();
