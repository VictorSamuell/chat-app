window.Papo = (() => {
  const read = (key, fallback) => { try { return JSON.parse(localStorage.getItem(key)) ?? fallback; } catch { return fallback; } };
  const write = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { return false; } };
  const newId = () => { const bytes = crypto.getRandomValues(new Uint8Array(24)); return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join(''); };
  let token = read('papo.token', null);
  if (typeof token !== 'string' || !/^[a-f0-9]{48}$/.test(token)) { token = newId(); write('papo.token', token); }
  const recent = () => { const value = read('papo.rooms', []); return Array.isArray(value) ? value.filter(r => r && /^[A-Za-z0-9_-]{24}$/.test(r.id) && typeof r.name === 'string').slice(0, 8) : []; };
  const remember = room => write('papo.rooms', [{ id: room.id, name: room.name, visited: Date.now() }, ...recent().filter(r => r.id !== room.id)].slice(0, 8));
  const el = (tag, cls, text) => { const node = document.createElement(tag); if (cls) node.className = cls; if (text !== undefined) node.textContent = text; return node; };
  let toastTimer;
  const toast = (text, error = false) => { const box = document.querySelector('#toast'); box.textContent = text; box.classList.toggle('error', error); box.hidden = false; clearTimeout(toastTimer); toastTimer = setTimeout(() => { box.hidden = true; }, 5000); };
  const inviteId = input => { const value = input.trim(); if (/^[A-Za-z0-9_-]{24}$/.test(value)) return value; try { const url = new URL(value); if (!['http:', 'https:'].includes(url.protocol) || url.origin !== location.origin) return null; return url.pathname.match(/^\/r\/([A-Za-z0-9_-]{24})\/?$/)?.[1] || null; } catch { return null; } };
  const avatar = (name, id = '') => { const colors = ['coral', 'blue', 'lilac', 'lime']; const n = [...id].reduce((a, c) => a + c.charCodeAt(0), 0); return el('span', `avatar ${colors[n % colors.length]}`, [...name][0]?.toLocaleUpperCase('pt-BR') || '?'); };
  return { read, write, token, newId, recent, remember, el, toast, inviteId, avatar };
})();
