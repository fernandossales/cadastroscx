/* app.js — app de campo (iPhone/Android). Dados ficam no aparelho (IndexedDB) até exportar o JSON. */
'use strict';
const S = window.SIMIL_SCHEMA, G = window.CADX_GEO;
const FORMATO = 2;
const $ = (s, el = document) => el.querySelector(s);
const h = (tag, at = {}, ...kids) => {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(at)) {
    if (k === 'on') for (const [ev, fn] of Object.entries(v)) e.addEventListener(ev, fn);
    else if (k === 'class') e.className = v;
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v === true ? '' : v);
  }
  for (const c of kids.flat()) if (c !== null && c !== undefined && c !== false) e.append(c.nodeType ? c : document.createTextNode(c));
  return e;
};
const toast = m => { const t = $('#toast'); t.textContent = m; t.classList.add('on'); clearTimeout(toast.t); toast.t = setTimeout(() => t.classList.remove('on'), 2600); };
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const iOS = /iP(hone|ad|od)/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const instalado = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

/* ---------- folha de diálogo (substitui prompt/confirm) ---------- */
function folha({ titulo, texto, campo, acoes }) {
  const d = $('#dlg');
  return new Promise(ok => {
    const inp = campo ? h('input', { class: 'in', type: 'text', value: campo.valor || '', placeholder: campo.dica || '', maxlength: 120 }) : null;
    const fecha = v => { d.close(); d.replaceChildren(); ok(v); };
    const sh = h('div', { class: 'sheet', role: 'dialog', 'aria-modal': 'true' },
      h('h3', {}, titulo), texto ? h('p', { class: 'mute', style: 'margin:0 0 10px' }, texto) : null, inp,
      h('div', { class: 'ac' }, acoes.map(a => h('button', { class: 'btn' + (a.pri ? ' pri' : '') + (a.dan ? ' dan' : ''), on: { click: () => fecha(inp ? (a.valor === false ? null : inp.value.trim()) : a.valor) } }, a.rot))));
    d.replaceChildren(sh);
    d.onclick = e => { if (e.target === d) fecha(null); };
    d.oncancel = e => { e.preventDefault(); fecha(null); };
    d.showModal(); if (inp) setTimeout(() => inp.focus(), 50);
  });
}
const confirma = (titulo, texto, rot = 'Confirmar', dan = false) => folha({ titulo, texto, acoes: [{ rot, pri: !dan, dan, valor: true }, { rot: 'Cancelar', valor: false }] });

/* ---------- armazenamento ---------- */
const DB = {
  db: null,
  abrir() {
    return this.db ? Promise.resolve(this.db) : new Promise((ok, err) => {
      const r = indexedDB.open('cadastroscx', 2);
      r.onupgradeneeded = () => { const db = r.result; if (!db.objectStoreNames.contains('cad')) db.createObjectStore('cad', { keyPath: 'id' }); if (!db.objectStoreNames.contains('foto')) db.createObjectStore('foto'); };
      r.onsuccess = () => ok(this.db = r.result); r.onerror = () => err(r.error);
    });
  },
  async op(store, modo, fn) { const db = await this.abrir(); return new Promise((ok, err) => { const t = db.transaction(store, modo); const q = fn(t.objectStore(store)); t.oncomplete = () => ok(q && q.result); t.onerror = () => err(t.error); }); },
  todos() { return this.op('cad', 'readonly', s => s.getAll()); },
  ler(id) { return this.op('cad', 'readonly', s => s.get(id)); },
  gravar(c) { return this.op('cad', 'readwrite', s => s.put(c)); },
  apagar(id) { return this.op('cad', 'readwrite', s => s.delete(id)); },
  foto(id) { return this.op('foto', 'readonly', s => s.get(id)); },
  gravaFoto(id, b) { return this.op('foto', 'readwrite', s => s.put(b, id)); },
  apagaFoto(id) { return this.op('foto', 'readwrite', s => s.delete(id)); },
};
if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => { });

/* ---------- estado ---------- */
let cad = null, aba = 'identificacao', tSalvar = null, ultimaPos = null;
const urls = new Map();
const verEsc = () => localStorage.getItem('cadx-esc') === '1';
const abasVisiveis = () => S.abas.filter(a => !a.escritorio || verEsc());
const vazio = v => v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || (typeof v === 'object' && !Array.isArray(v) && v.lat == null);
const camposDe = a => a.campos.filter(c => c[0] !== '§');
const feitos = (a, d = cad.dados) => camposDe(a).filter(c => !vazio(d[c[0]])).length;
function pct(c) { const as = abasVisiveis(); const t = as.reduce((s, a) => s + camposDe(a).length, 0); const f = as.reduce((s, a) => s + feitos(a, c.dados || {}), 0); return t ? Math.round(f * 100 / t) : 0; }

function salvar() {
  if (!cad) return;
  cad.atualizado = new Date().toISOString();
  $('#hStatus').textContent = 'salvando…';
  clearTimeout(tSalvar);
  tSalvar = setTimeout(async () => { const c = cad; await DB.gravar(c); if (c === cad) { $('#hStatus').textContent = 'salvo'; atualizaContadores(); } }, 350);
}
const setV = (k, v) => { if (vazio(v)) delete cad.dados[k]; else cad.dados[k] = v; salvar(); };

/* ---------- lista ---------- */
async function telaLista() {
  await fecharCad();
  history.replaceState(null, '', location.pathname);
  $('#bVoltar').classList.add('hidden'); $('#tabs').classList.add('hidden'); $('#prog').classList.add('hidden');
  $('#hTitulo').textContent = 'Cadastros de campo'; $('#hStatus').textContent = '';
  const m = $('#main'); m.replaceChildren();
  if (iOS && !instalado) m.append(h('div', { class: 'aviso' }, h('b', {}, 'Instale na tela de início. '), 'No Safari: Compartilhar › “Adicionar à Tela de Início”. Assim o iPhone não apaga os cadastros e o app abre sem sinal.'));
  const lst = (await DB.todos()).sort((a, b) => (b.atualizado || '').localeCompare(a.atualizado || ''));
  if (!lst.length) m.append(h('div', { class: 'empty' }, 'Nenhum cadastro ainda.', h('br'), 'Toque em “Novo cadastro” para começar a vistoria.'));
  for (const c of lst) {
    const p = pct(c), nf = (c.fotos || []).length;
    m.append(h('button', { class: 'card lst', style: 'width:100%;text-align:left', on: { click: () => abrir(c.id) } },
      h('div', { class: 'grow' }, h('div', { class: 't' }, c.titulo || '(sem nome)'),
        h('div', { class: 's' }, `${p}% · ${nf} foto${nf === 1 ? '' : 's'} · ${new Date(c.atualizado).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}` + (c.exportado ? ' · exportado' : '')),
        h('div', { class: 'pbar' }, h('i', { style: `width:${p}%` }))),
      h('span', { class: 'mute', style: 'font-size:22px' }, '›')));
  }
  $('#foot').replaceChildren(
    h('button', { class: 'btn', on: { click: () => $('#fImp').click() } }, 'Carregar JSON'),
    h('button', { class: 'btn pri', on: { click: novo } }, '+ Novo cadastro'));
}
async function novo() {
  const t = await folha({ titulo: 'Novo cadastro', texto: 'Identificação para achar depois (endereço, cliente ou nº da OS).', campo: { dica: 'Ex.: Rua das Flores, 120' }, acoes: [{ rot: 'Criar', pri: true }, { rot: 'Cancelar', valor: false }] });
  if (t === null) return;
  const c = { app: 'cadastroscx', formato: FORMATO, schema: S.versao, id: 'c' + uid(), titulo: t || 'Cadastro ' + new Date().toLocaleDateString('pt-BR'), criado: new Date().toISOString(), atualizado: new Date().toISOString(), dados: { un_data: new Date().toLocaleDateString('sv-SE') }, fotos: [] };
  await DB.gravar(c); aba = 'identificacao'; abrir(c.id);
}

/* ---------- editor ---------- */
async function fecharCad() {
  if (cad) { clearTimeout(tSalvar); await DB.gravar(cad); }
  urls.forEach(u => URL.revokeObjectURL(u)); urls.clear(); cad = null;
}
async function abrir(id) {
  const c = await DB.ler(id); if (!c) return telaLista();
  cad = c; cad.dados = cad.dados || {}; cad.fotos = cad.fotos || [];
  // migração do formato 1 (foto em base64 dentro do cadastro)
  let mig = false;
  for (const f of cad.fotos) { if (!f.id) f.id = 'f' + uid(); if (f.img) { await DB.gravaFoto(f.id, G.dataURLparaBlob(f.img)); delete f.img; mig = true; } }
  if (mig) { cad.formato = FORMATO; await DB.gravar(cad); }
  history.replaceState(null, '', '#' + id);
  $('#bVoltar').classList.remove('hidden'); $('#tabs').classList.remove('hidden'); $('#prog').classList.remove('hidden');
  $('#hTitulo').textContent = cad.titulo; $('#hStatus').textContent = '';
  $('#foot').replaceChildren(
    h('button', { class: 'btn', on: { click: () => $('#fCam').click() } }, '📷 Foto'),
    h('button', { class: 'btn pri', on: { click: () => exportar(cad) } }, 'Exportar'));
  if (!abasVisiveis().some(a => a.id === aba) && aba !== 'fotos') aba = 'identificacao';
  render(); resolvePendentes();
}
function chips() {
  const t = $('#tabs'); t.replaceChildren();
  for (const a of abasVisiveis()) t.append(h('button', { class: 'chip' + (aba === a.id ? ' on' : ''), 'data-a': a.id, on: { click: () => irAba(a.id) } }, a.titulo, h('small', {}, `${feitos(a)}/${camposDe(a).length}`)));
  t.append(h('button', { class: 'chip' + (aba === 'fotos' ? ' on' : ''), 'data-a': 'fotos', on: { click: () => irAba('fotos') } }, 'Fotos', h('small', {}, String(cad.fotos.length))));
  setTimeout(() => t.querySelector('.on')?.scrollIntoView({ inline: 'center', block: 'nearest' }), 0);
}
const irAba = id => { aba = id; render(); window.scrollTo(0, 0); };
function atualizaContadores() {
  if (!cad) return;
  for (const b of $('#tabs').children) { const a = S.abas.find(x => x.id === b.dataset.a); b.querySelector('small').textContent = a ? `${feitos(a)}/${camposDe(a).length}` : String(cad.fotos.length); }
  $('#prog i').style.width = pct(cad) + '%';
}
function render() {
  chips(); atualizaContadores();
  const m = $('#main'); m.replaceChildren();
  if (aba === 'fotos') return renderFotos(m);
  const a = S.abas.find(x => x.id === aba);
  if (a.escritorio) m.append(h('p', { class: 'esc' }, 'Aba normalmente preenchida no escritório.'));
  let box = null;
  for (const c of a.campos) {
    if (c[0] === '§') { m.append(h('h2', {}, c[1])); box = m.appendChild(h('div', { class: 'card' })); continue; }
    if (!box) box = m.appendChild(h('div', { class: 'card' }));
    box.append(campo(c));
  }
}
function campo([k, rot, tipo, , opts]) {
  const v = cad.dados[k], id = 'f_' + k, max = S.MAX[k];
  const w = h('div', { class: 'f' });
  if (tipo === 't' || tipo === 'n' || tipo === 'ac') {
    const num = tipo === 'n' || tipo === 'ac';
    const so = /cep|cpfcnpj/.test(k);
    w.append(h('label', { for: id }, rot), h('input', { id, class: 'in', type: 'text', inputmode: so ? 'numeric' : num ? 'decimal' : null, enterkeyhint: 'next', maxlength: max, value: v ?? '', autocomplete: 'off', autocapitalize: num ? 'off' : 'sentences', on: { input: e => setV(k, e.target.value.trim()) } }));
  } else if (tipo === 'a') {
    const ta = h('textarea', { id, class: 'in', on: { input: e => setV(k, e.target.value) } }); ta.value = v ?? ''; w.append(h('label', { for: id }, rot), ta);
  } else if (tipo === 'dt') {
    w.append(h('label', { for: id }, rot), h('input', { id, class: 'in', type: 'date', value: v ?? '', on: { change: e => setV(k, e.target.value) } }));
  } else if (tipo === 's') {
    w.append(h('label', { for: id }, rot), h('select', { id, class: 'in', on: { change: e => setV(k, e.target.value) } }, h('option', { value: '' }, 'Selecione…'), opts.map(o => h('option', { value: o, selected: o === v }, o))));
  } else if (tipo === 'r') {
    const box = h('div', { class: 'opts', role: 'radiogroup', 'aria-label': rot });
    for (const o of opts) box.append(h('button', { type: 'button', class: 'opt' + (o === v ? ' on' : ''), role: 'radio', 'aria-checked': String(o === v), on: { click: () => { const n = cad.dados[k] === o ? '' : o; setV(k, n); for (const b of box.children) { const on = b.textContent === n; b.classList.toggle('on', on); b.setAttribute('aria-checked', String(on)); } } } }, o));
    w.append(h('div', { class: 'lb' }, rot), box);
  } else if (tipo === 'cg' || tipo === 'k') {
    const lbs = opts.map(o => Array.isArray(o) ? o[1] : o);
    const box = h('div', { class: 'opts', role: 'group', 'aria-label': rot });
    for (const o of lbs) { const on = (v || []).includes(o); box.append(h('button', { type: 'button', class: 'opt' + (on ? ' on' : ''), 'aria-pressed': String(on), on: { click: e => { const cur = new Set(cad.dados[k] || []); cur.has(o) ? cur.delete(o) : cur.add(o); setV(k, lbs.filter(x => cur.has(x))); e.currentTarget.classList.toggle('on'); e.currentTarget.setAttribute('aria-pressed', String(cur.has(o))); } } }, o)); }
    w.append(h('div', { class: 'lb' }, rot), box);
  } else if (tipo === 'gps') {
    w.append(h('div', { class: 'lb' }, rot), campoGPS(k));
  }
  return w;
}

/* ---------- coordenadas automáticas ---------- */
const lendo = new Set();
function campoGPS(k) {
  const v = cad.dados[k];
  const caixa = h('div', { class: 'gps', role: 'button', tabindex: '0', 'aria-label': 'Capturar localização' });
  const desenha = (estado, l) => {
    caixa.replaceChildren();
    if (estado === 'lendo') caixa.append(...[h('div', {}, h('span', { class: 'spin' }), 'Obtendo localização…'), l ? h('div', { class: 'll' }, `${l.lat.toFixed(6)}, ${l.lon.toFixed(6)}`) : null, h('div', { class: 'mute' }, l ? `Precisão atual ±${l.prec} m — melhorando…` : 'Fique em frente ao imóvel, ao ar livre.')].filter(Boolean));
    else if (v && v.lat != null) {
      caixa.append(h('div', { class: 'll' }, `${(+v.lat).toFixed(6)}, ${(+v.lon).toFixed(6)}`),
        h('div', { class: 'lugar' }, v.municipio ? `${v.municipio} – ${v.uf}` : (v.geoPend ? 'Município: consulta pendente (sem internet)' : '')),
        h('div', { class: 'mute' }, `±${v.prec} m · ${new Date(v.hora).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`),
        h('div', { class: 'ac' },
          h('button', { type: 'button', class: 'btn sm', on: { click: e => { e.stopPropagation(); capturar(k); } } }, 'Atualizar aqui'),
          h('a', { class: 'btn sm', href: `https://maps.apple.com/?q=${v.lat},${v.lon}`, target: '_blank', rel: 'noopener', on: { click: e => e.stopPropagation() } }, 'Ver no mapa')));
    } else caixa.append(h('div', { class: 'lugar' }, '📍 Toque para registrar onde você está'), h('div', { class: 'mute' }, 'A coordenada é lida do GPS do aparelho — não precisa digitar.'));
  };
  caixa.addEventListener('click', () => { if (!(v && v.lat != null)) capturar(k); });
  caixa.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); capturar(k); } });
  caixa._desenha = desenha;
  desenha(lendo.has(k) ? 'lendo' : '');
  // ao abrir o campo vazio, já começa a ler
  if (!(v && v.lat != null) && !lendo.has(k) && !campoGPS.tentou?.[cad.id]) { (campoGPS.tentou ||= {})[cad.id] = 1; setTimeout(() => capturar(k), 300); }
  return caixa;
}
async function capturar(k) {
  if (lendo.has(k)) return; lendo.add(k);
  const id = cad.id; const redes = () => { if (cad && cad.id === id && aba === 'identificacao') render(); };
  redes();
  try {
    const l = await G.posicao({ maxMs: 15000, alvo: 10, aoAtualizar: p => { const c = document.querySelector('.gps'); c && c._desenha && c._desenha('lendo', p); } });
    ultimaPos = l;
    if (!cad || cad.id !== id) return;
    setV(k, l); lendo.delete(k); redes();
    if (l.prec > 30) toast(`Precisão de ±${l.prec} m. Para melhorar, vá para área aberta e toque em “Atualizar aqui”.`);
    preencheLugar(k, l);
  } catch (e) { lendo.delete(k); redes(); folha({ titulo: 'Localização', texto: e.message, acoes: [{ rot: 'OK', pri: true }] }); }
}
async function preencheLugar(k, l) {
  const id = cad.id;
  try {
    const r = await G.lugar(l.lat, l.lon);
    if (!cad || cad.id !== id) return;
    const v = { ...cad.dados[k], municipio: r.municipio, uf: r.uf }; delete v.geoPend; cad.dados[k] = v;
    // sugere o endereço só nos campos ainda vazios
    const map = { end_municipio: r.municipio, end_uf: r.uf, end_bairro: r.bairro, end_logradouro: r.logradouro, end_cep: r.cep };
    const novos = Object.entries(map).filter(([kk, vv]) => vv && vazio(cad.dados[kk]));
    novos.forEach(([kk, vv]) => cad.dados[kk] = vv);
    salvar(); if (aba === 'identificacao') render();
    toast(`${r.municipio} – ${r.uf}` + (novos.length ? ' · endereço sugerido nos campos vazios' : ''));
  } catch { if (cad && cad.id === id) { cad.dados[k] = { ...cad.dados[k], geoPend: true }; salvar(); if (aba === 'identificacao') render(); } }
}

/* ---------- fotos ---------- */
async function urlFoto(f) {
  if (urls.has(f.id)) return urls.get(f.id);
  const b = await DB.foto(f.id); if (!b) return '';
  const u = URL.createObjectURL(b); urls.set(f.id, u); return u;
}
function renderFotos(m) {
  m.append(h('div', { class: 'addf' },
    h('button', { class: 'btn pri', on: { click: () => $('#fCam').click() } }, '📷 Câmera'),
    h('button', { class: 'btn', on: { click: () => $('#fAlb').click() } }, '🖼 Álbum')));
  if (!cad.fotos.length) { m.append(h('div', { class: 'empty' }, 'Nenhuma foto. Comece pela fachada principal.', h('br'), 'Cada foto recebe data, coordenada e município.')); return; }
  const g = h('div', { class: 'fotos' }); m.append(g);
  cad.fotos.forEach((f, i) => {
    const img = h('img', { alt: f.amb || 'foto ' + (i + 1), loading: 'lazy' });
    urlFoto(f).then(u => img.src = u);
    const geoTxt = f.lat != null ? `${f.fonteGeo === 'foto' ? 'Local da foto' : 'Local do aparelho ao inserir'}${f.municipio ? '' : f.geoPend ? ' · município pendente' : ''}` : 'Sem localização';
    g.append(h('div', { class: 'foto' },
      h('div', { class: 'im' }, img, h('div', { class: 'stamp' }, G.linhasCarimbo(f).join('\n'))),
      h('div', { class: 'b' },
        h('select', { class: 'in', 'aria-label': 'Referência da foto', on: { change: e => { f.amb = e.target.value; salvar(); } } }, h('option', { value: '' }, 'Referência da foto…'), S.AMBIENTES.map(a => h('option', { value: a, selected: a === f.amb }, a))),
        h('input', { class: 'in', type: 'text', maxlength: S.FOTO_DESC_MAX, placeholder: `Descrição (até ${S.FOTO_DESC_MAX} letras)`, value: f.desc || '', on: { input: e => { f.desc = e.target.value; salvar(); } } }),
        h('div', { class: 'geo' + (f.lat == null || f.geoPend ? ' pend' : '') }, geoTxt),
        h('div', { class: 'row' },
          h('span', { class: 'mute grow' }, `#${i + 1}`),
          h('button', { class: 'btn sm', 'aria-label': 'Subir', disabled: i === 0, on: { click: () => { cad.fotos.splice(i - 1, 0, cad.fotos.splice(i, 1)[0]); salvar(); render(); } } }, '↑'),
          h('button', { class: 'btn sm', 'aria-label': 'Descer', disabled: i === cad.fotos.length - 1, on: { click: () => { cad.fotos.splice(i + 1, 0, cad.fotos.splice(i, 1)[0]); salvar(); render(); } } }, '↓'),
          f.lat == null ? h('button', { class: 'btn sm', on: { click: () => localFoto(f, true) } }, '📍 Usar local atual') : null,
          h('button', { class: 'btn sm dan', on: { click: async () => { if (await confirma('Excluir foto?', `Foto #${i + 1} ${f.amb || ''}`, 'Excluir', true)) { cad.fotos.splice(i, 1); await DB.apagaFoto(f.id); salvar(); render(); } } } }, 'Excluir')))));
  });
}
async function posRapida() {
  if (ultimaPos && Date.now() - new Date(ultimaPos.hora).getTime() < 120000 && ultimaPos.prec <= 50) return ultimaPos;
  ultimaPos = await G.posicao({ maxMs: 8000, alvo: 25 }); return ultimaPos;
}
async function localFoto(f, forcar) {
  if (f.lat == null || forcar) {
    try { const p = await posRapida(); Object.assign(f, { lat: p.lat, lon: p.lon, prec: p.prec, fonteGeo: 'aparelho' }); } catch (e) { if (forcar) toast(e.message); return; }
  }
  try { const r = await G.lugar(f.lat, f.lon); f.municipio = r.municipio; f.uf = r.uf; delete f.geoPend; }
  catch { f.geoPend = true; }
}
async function addFotos(files, origem) {
  if (!cad || !files.length) return;
  const id = cad.id; aba = 'fotos'; render();
  const sug = ['Fachada Principal', 'Logradouro', 'Identificação do Imóvel'];
  const novas = [];
  for (const file of files) {
    try {
      const ex = /jpe?g/i.test(file.type) ? G.exif(await file.slice(0, 256 * 1024).arrayBuffer()) : null;
      const blob = await G.reduzir(file);
      const f = { id: 'f' + uid(), amb: cad.fotos.length < sug.length ? sug[cad.fotos.length] : '', desc: '', origem, hora: (ex && ex.data) || (origem === 'camera' ? new Date().toISOString() : new Date(file.lastModified || Date.now()).toISOString()) };
      if (ex && ex.lat != null) Object.assign(f, { lat: ex.lat, lon: ex.lon, fonteGeo: 'foto' });
      await DB.gravaFoto(f.id, blob);
      cad.fotos.push(f); novas.push(f);
    } catch { toast('Não consegui ler uma das imagens.'); }
  }
  salvar(); if (cad && cad.id === id && aba === 'fotos') render();
  toast(novas.length > 1 ? `${novas.length} fotos — buscando local…` : 'Foto adicionada — buscando local…');
  for (const f of novas) await localFoto(f);
  if (cad && cad.id === id) { salvar(); if (aba === 'fotos') render(); }
  const sem = novas.filter(f => f.lat == null).length;
  if (sem) toast(`${sem} foto(s) sem localização: toque em “Usar local atual”.`);
}
$('#fCam').addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; addFotos(fs, 'camera'); });
$('#fAlb').addEventListener('change', e => { const fs = [...e.target.files]; e.target.value = ''; addFotos(fs, 'album'); });
async function resolvePendentes() {
  if (!cad || navigator.onLine === false) return;
  const id = cad.id; let mudou = false;
  for (const f of cad.fotos) if (f.lat != null && !f.municipio) { await localFoto(f); mudou = mudou || !!f.municipio; }
  const c = cad && cad.dados.coord; if (c && c.lat != null && !c.municipio) { await preencheLugar('coord', c); }
  if (mudou && cad && cad.id === id) { salvar(); if (aba === 'fotos') render(); }
}
addEventListener('online', resolvePendentes);

/* ---------- exportar / carregar ---------- */
async function pacote(c) {
  const fotos = [];
  for (const f of c.fotos || []) { const b = await DB.foto(f.id); fotos.push({ ...f, img: b ? await G.blobParaDataURL(b) : null }); }
  return { ...c, app: 'cadastroscx', formato: FORMATO, schema: S.versao, exportadoEm: new Date().toISOString(), fotos };
}
const nomeArq = t => (t || 'cadastro').normalize('NFD').replace(/\p{M}/gu, '').replace(/[^\w-]+/g, '_').replace(/^_|_$/g, '').slice(0, 40);
async function compartilha(obj, nome) {
  const blob = new Blob([JSON.stringify(obj)], { type: 'application/json' });
  const file = new File([blob], nome, { type: 'application/json' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: nome }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const a = h('a', { href: URL.createObjectURL(blob), download: nome }); document.body.append(a); a.click(); a.remove();
  toast('Arquivo salvo em Downloads'); return true;
}
async function exportar(c) {
  if (cad && c.id === cad.id) { clearTimeout(tSalvar); await DB.gravar(cad); }
  const semRef = (c.fotos || []).filter(f => !f.amb).length;
  if (semRef && !await confirma('Fotos sem referência', `${semRef} foto(s) sem “Referência”. No SIMIL elas entram como “Outros”. Exportar assim?`, 'Exportar')) return;
  toast('Gerando arquivo…');
  const ok = await compartilha(await pacote(c), `cadastro-${nomeArq(c.titulo)}-${new Date().toLocaleDateString('sv-SE')}.json`);
  if (ok) { c.exportado = new Date().toISOString(); await DB.gravar(c); }
}
async function exportarTodos() {
  const lst = await DB.todos(); if (!lst.length) return toast('Nada para exportar.');
  toast('Gerando backup…');
  const cadastros = []; for (const c of lst) cadastros.push(await pacote(c));
  compartilha({ app: 'cadastroscx', formato: FORMATO, backup: true, exportadoEm: new Date().toISOString(), cadastros }, `cadastros-backup-${new Date().toLocaleDateString('sv-SE')}.json`);
}
$('#fImp').addEventListener('change', async e => {
  const f = e.target.files[0]; e.target.value = ''; if (!f) return;
  let j; try { j = JSON.parse(await f.text()); } catch { return folha({ titulo: 'Arquivo inválido', texto: 'Não é um JSON.', acoes: [{ rot: 'OK', pri: true }] }); }
  if (j.app !== 'cadastroscx') return folha({ titulo: 'Arquivo não reconhecido', texto: 'Este JSON não foi gerado por este app.', acoes: [{ rot: 'OK', pri: true }] });
  const lst = j.backup ? j.cadastros : [j]; let n = 0;
  for (const c of lst) {
    const ex = await DB.ler(c.id);
    if (ex && !await confirma('Substituir?', `“${c.titulo}” já existe neste aparelho (alterado em ${new Date(ex.atualizado).toLocaleString('pt-BR')}). Substituir pela versão do arquivo?`, 'Substituir', true)) continue;
    if (ex) for (const fo of ex.fotos || []) if (fo.id) await DB.apagaFoto(fo.id);
    for (const fo of c.fotos || []) { if (!fo.id) fo.id = 'f' + uid(); if (fo.img) { await DB.gravaFoto(fo.id, G.dataURLparaBlob(fo.img)); delete fo.img; } }
    delete c.exportadoEm; c.formato = FORMATO; await DB.gravar(c); n++;
  }
  toast(n ? `${n} cadastro(s) carregado(s)` : 'Nada carregado');
  if (lst.length === 1 && n) abrir(lst[0].id); else telaLista();
});

/* ---------- menu ⋯ ---------- */
$('#bMenu').addEventListener('click', async () => {
  const esc = verEsc();
  const ac = cad
    ? [{ rot: 'Exportar este cadastro (JSON)', valor: 'exp', pri: true }, { rot: 'Renomear', valor: 'ren' }, { rot: (esc ? 'Ocultar' : 'Mostrar') + ' abas do escritório', valor: 'esc' }, { rot: 'Excluir cadastro', valor: 'del', dan: true }, { rot: 'Fechar', valor: null }]
    : [{ rot: 'Carregar cadastro ou backup (JSON)', valor: 'imp', pri: true }, { rot: 'Exportar todos (backup)', valor: 'bkp' }, { rot: (esc ? 'Ocultar' : 'Mostrar') + ' abas do escritório', valor: 'esc' }, { rot: 'Como preencher no SIMIL', valor: 'simil' }, { rot: 'Fechar', valor: null }];
  const r = await folha({ titulo: cad ? cad.titulo : 'Opções', acoes: ac });
  if (r === 'exp') exportar(cad);
  if (r === 'imp') $('#fImp').click();
  if (r === 'bkp') exportarTodos();
  if (r === 'simil') location.href = 'preencher.html';
  if (r === 'esc') { localStorage.setItem('cadx-esc', esc ? '0' : '1'); cad ? (aba = abasVisiveis().some(a => a.id === aba) ? aba : 'identificacao', render()) : telaLista(); }
  if (r === 'ren') { const t = await folha({ titulo: 'Renomear', campo: { valor: cad.titulo }, acoes: [{ rot: 'Salvar', pri: true }, { rot: 'Cancelar', valor: false }] }); if (t) { cad.titulo = t; $('#hTitulo').textContent = t; salvar(); } }
  if (r === 'del' && await confirma('Excluir cadastro?', 'Apaga os dados e as fotos deste aparelho. Exporte antes se precisar.', 'Excluir', true)) { const c = cad; for (const f of c.fotos) await DB.apagaFoto(f.id); await DB.apagar(c.id); cad = null; telaLista(); }
});
$('#bVoltar').addEventListener('click', telaLista);
document.addEventListener('visibilitychange', () => { if (document.hidden && cad) { clearTimeout(tSalvar); DB.gravar(cad); } });

const ini = location.hash.slice(1); ini ? abrir(ini) : telaLista();
if ('serviceWorker' in navigator && location.protocol === 'https:') {
  const tinha = !!navigator.serviceWorker.controller;
  navigator.serviceWorker.register('sw.js').catch(() => { });
  // versão nova publicada: recarrega uma vez (só se não houver campo sendo digitado)
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (tinha && !document.activeElement?.matches('input,textarea')) location.reload(); });
}
