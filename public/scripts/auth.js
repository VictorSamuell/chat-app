const { read, write, token, recent, remember, el, inviteId } = Papo;
let mode = 'create';
const form = document.querySelector('#entry-form');
const nickname = document.querySelector('#nickname');
nickname.value = read('papo.nickname', '');
function setMode(value) {
  mode = value;
  for (const tab of ['create', 'join']) { const active = tab === mode; document.querySelector(`#${tab}-tab`).setAttribute('aria-selected', active); document.querySelector(`#${tab}-tab`).tabIndex = active ? 0 : -1; document.querySelector(`#${tab}-panel`).hidden = !active; }
  document.querySelector('#room-name').disabled = mode !== 'create';
  document.querySelector('#room-name').required = mode === 'create';
  document.querySelector('#invite').disabled = mode !== 'join';
  document.querySelector('#invite').required = mode === 'join';
  document.querySelector('#entry-submit').textContent = mode === 'create' ? 'Criar sala ↗' : 'Entrar na conversa ↗';
  document.querySelector('#entry-error').textContent = '';
}
for (const tab of ['create', 'join']) {
  const button = document.querySelector(`#${tab}-tab`);
  button.addEventListener('click', () => setMode(tab));
  button.addEventListener('keydown', e => { if (['ArrowLeft', 'ArrowRight'].includes(e.key)) { e.preventDefault(); setMode(mode === 'create' ? 'join' : 'create'); document.querySelector(`#${mode}-tab`).focus(); } });
}
form.addEventListener('submit', async e => {
  e.preventDefault();
  const submit = document.querySelector('#entry-submit'), error = document.querySelector('#entry-error');
  error.textContent = '';
  if (!nickname.value.trim()) { error.textContent = 'Escolha um apelido para continuar.'; return; }
  submit.disabled = true; submit.textContent = 'Só um instante…';
  try {
    let room;
    if (mode === 'create') {
      const response = await fetch('/api/rooms', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: document.querySelector('#room-name').value.trim(), token }) });
      room = await response.json(); if (!response.ok) throw new Error(room.error);
    } else {
      const id = inviteId(document.querySelector('#invite').value);
      if (!id) throw new Error('Cole um convite do Zap 2 ou o código da sala.');
      const response = await fetch(`/api/rooms/${id}`); room = await response.json(); if (!response.ok) throw new Error(room.error);
    }
    write('papo.nickname', nickname.value.trim()); remember(room); location.assign(`/r/${room.id}`);
  } catch (err) { error.textContent = err.message === 'Failed to fetch' ? 'Não foi possível conectar. Confira sua conexão e tente novamente.' : err.message; }
  finally { submit.disabled = false; submit.textContent = mode === 'create' ? 'Criar sala ↗' : 'Entrar na conversa ↗'; }
});
const list = document.querySelector('#recent-rooms');
if (!recent().length) { const empty = el('div', 'recent-empty'); empty.append(el('span', '', '↗'), el('div', '', 'As salas que você visitar aparecem aqui. Que tal começar a primeira?')); list.append(empty); }
for (const room of recent().slice(0, 3)) {
  const link = el('a', 'recent-room'); link.href = `/r/${room.id}`;
  const info = el('div'); info.append(el('strong', '', room.name), el('small', '', 'Voltar para a conversa'));
  link.append(el('span', 'little-hash', '#'), info, el('span', '', '↗')); list.append(link);
}
