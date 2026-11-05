/* Preenchedor do SIMIL a partir do JSON do app de campo (cadastroscx).
   Roda dentro de https://www.simil.caixa.gov.br — Laudo de Avaliação » Unidade Isolada Construção.
   Carregado pelo favorito (bookmarklet) ou pelo script do Tampermonkey. Não clica em Gravar/Finalizar. */
(function () {
  if (window.__cadx) { window.__cadx.abrir(); return; }
  const BASE = (document.currentScript && document.currentScript.src || 'https://fernandossales.github.io/cadastroscx/simil-preencher.js').replace(/simil-preencher\.js.*$/, '');
  const ESPERA_AJAX = 15000;

  /* ---------- utilidades ---------- */
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const norm = s => String(s ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').replace(/[.\s]+$/, '').trim();
  const painel = aba => document.getElementById('formCadastro-tab-' + aba);
  const ajaxAtivo = () => {
    const jq = window.jQuery ? jQuery.active : 0;
    const q = window.PrimeFaces && PrimeFaces.ajax && PrimeFaces.ajax.Queue;
    const pf = q ? ((q.requests && q.requests.length) || (q.isEmpty && !q.isEmpty()) || 0) : 0;
    return jq > 0 || pf > 0;
  };
  async function ocioso(min = 120) {
    await sleep(min);
    const t0 = Date.now();
    while (ajaxAtivo() && Date.now() - t0 < ESPERA_AJAX) await sleep(120);
    await sleep(80);
  }
  function achar(aba, sel) {
    const P = painel(aba); if (!P) return null;
    const [suf, n] = sel.split('#');
    const l = [...P.querySelectorAll('[id$="-' + CSS.escape(suf) + '"]')].filter(e => !/_label$/.test(e.id));
    return l[(parseInt(n, 10) || 1) - 1] || null;
  }
  const bloqueado = e => e.disabled || e.readOnly || e.getAttribute('aria-disabled') === 'true';
  const ev = (e, tipo) => e.dispatchEvent(tipo.startsWith('key') ? new KeyboardEvent(tipo, { bubbles: true, key: '0' }) : new Event(tipo, { bubbles: true }));
  const dataBR = v => /^\d{4}-\d{2}-\d{2}$/.test(v) ? v.split('-').reverse().join('/') : v;

  function escreve(e, v) {
    e.focus(); e.value = v;
    ['input', 'keyup', 'change'].forEach(t => ev(e, t));
    e.blur(); ev(e, 'blur'); ev(e, 'focusout');
  }

  /* ---------- armazenamento local no SIMIL (IndexedDB) ---------- */
  const KV = {
    db: null,
    abrir() { return this.db ? Promise.resolve(this.db) : new Promise((ok, err) => { const r = indexedDB.open('cadastroscx-simil', 1); r.onupgradeneeded = () => r.result.createObjectStore('kv'); r.onsuccess = () => ok(this.db = r.result); r.onerror = () => err(r.error); }); },
    async get(k) { const db = await this.abrir(); return new Promise(ok => { const r = db.transaction('kv').objectStore('kv').get(k); r.onsuccess = () => ok(r.result); r.onerror = () => ok(undefined); }); },
    async set(k, v) { const db = await this.abrir(); return new Promise((ok, err) => { const t = db.transaction('kv', 'readwrite'); t.objectStore('kv').put(v, k); t.oncomplete = ok; t.onerror = () => err(t.error); }); },
  };

  /* ---------- interface ---------- */
  const css = `
  #cadx{position:fixed;right:16px;bottom:16px;z-index:2147483000;width:360px;max-height:80vh;display:flex;flex-direction:column;background:#fff;color:#1c2321;border:1px solid #c9d1ce;border-radius:12px;box-shadow:0 8px 28px rgba(0,0,0,.18);font:13px/1.4 system-ui,"Segoe UI",sans-serif}
  #cadx *{box-sizing:border-box;font-family:inherit}
  #cadx .hd{display:flex;align-items:center;gap:8px;padding:10px 12px;background:#0d5c63;color:#fff;border-radius:12px 12px 0 0;cursor:move}
  #cadx .hd b{flex:1;font-size:14px}
  #cadx .hd button{background:none;border:0;color:#fff;font-size:16px;cursor:pointer;padding:0 4px}
  #cadx .bd{padding:12px;overflow:auto;display:grid;gap:8px}
  #cadx .bt{border:1px solid #c9d1ce;background:#f4f5f2;border-radius:8px;padding:8px 10px;cursor:pointer;text-align:left;font-size:13px}
  #cadx .bt.pri{background:#0d5c63;color:#fff;border-color:#0d5c63;font-weight:600}
  #cadx .bt:disabled{opacity:.45;cursor:default}
  #cadx .info{background:#eef4f3;border-radius:8px;padding:8px 10px}
  #cadx .info b{display:block}
  #cadx .log{background:#f7f7f5;border:1px solid #e3e6e3;border-radius:8px;padding:8px;max-height:220px;overflow:auto;font:11.5px/1.45 ui-monospace,Consolas,monospace;white-space:pre-wrap}
  #cadx .log .er{color:#b3261e}#cadx .log .av{color:#9a4a00}#cadx .log .ok{color:#1b6b3a}
  #cadx label{display:flex;gap:6px;align-items:center}
  #cadx-pill{position:fixed;right:16px;bottom:16px;z-index:2147483000;background:#0d5c63;color:#fff;border:0;border-radius:999px;padding:9px 14px;font:600 13px system-ui;cursor:pointer;box-shadow:0 4px 14px rgba(0,0,0,.2)}`;
  const st = document.createElement('style'); st.textContent = css; document.head.appendChild(st);
  const box = document.createElement('div'); box.id = 'cadx';
  box.innerHTML = `<div class="hd"><b>Cadastro de campo → SIMIL</b><button data-a="min" title="Minimizar">–</button></div>
  <div class="bd">
    <div class="info" id="cadx-info">Nenhum cadastro carregado.</div>
    <button class="bt" data-a="carregar">1 · Carregar JSON do celular</button>
    <button class="bt pri" data-a="preencher" disabled>2 · Preencher campos</button>
    <button class="bt" data-a="fotos" disabled>3 · Enviar fotos</button>
    <label><input type="checkbox" id="cadx-auto" checked> continuar as fotos sozinho a cada recarga</label>
    <button class="bt" data-a="parar">Parar</button>
    <button class="bt" data-a="verificar">Verificar mapeamento dos campos</button>
    <div class="log" id="cadx-log"></div>
  </div>`;
  const pill = document.createElement('button'); pill.id = 'cadx-pill'; pill.textContent = 'Cadastro de campo';
  const arq = document.createElement('input'); arq.type = 'file'; arq.accept = '.json,application/json'; arq.style.display = 'none';
  document.body.append(box, pill, arq);
  const $ = s => box.querySelector(s);
  const logEl = $('#cadx-log');
  const log = (m, c = '') => { const d = document.createElement('div'); if (c) d.className = c; d.textContent = m; logEl.appendChild(d); logEl.scrollTop = logEl.scrollHeight; };
  const mostrar = aberto => { box.style.display = aberto ? 'flex' : 'none'; pill.style.display = aberto ? 'none' : 'block'; };
  pill.onclick = () => mostrar(true);
  // arrastar
  (() => { const hd = $('.hd'); let ox, oy, arr = false; hd.addEventListener('mousedown', e => { if (e.target.tagName === 'BUTTON') return; arr = true; const r = box.getBoundingClientRect(); ox = e.clientX - r.left; oy = e.clientY - r.top; e.preventDefault(); }); addEventListener('mousemove', e => { if (!arr) return; box.style.left = (e.clientX - ox) + 'px'; box.style.top = (e.clientY - oy) + 'px'; box.style.right = 'auto'; box.style.bottom = 'auto'; }); addEventListener('mouseup', () => arr = false); })();

  let S = null, cad = null, parar = false;
  const naTelaDoLaudo = () => !!document.getElementById('formCadastro-tab-identificacao');
  const osDaTela = () => { const v = s => (document.querySelector('#formCadastro-tab-identificacao input[id*="' + s + '"]') || {}).value || ''; return [v('gihabGidur_os'), v('codSolicitante_os'), v('ordenador_os'), v('numeroAnoAutorizacao_os'), v('complementoAS_os'), v('sequencial_os'), v('versao_os')].join('.'); };

  function atualizaInfo(fila) {
    const i = $('#cadx-info');
    if (!cad) { i.textContent = 'Nenhum cadastro carregado.'; return; }
    const n = Object.keys(cad.dados || {}).length, f = (cad.fotos || []).length;
    i.innerHTML = '';
    const b = document.createElement('b'); b.textContent = cad.titulo || cad.id; i.appendChild(b);
    i.appendChild(document.createTextNode(`${n} campos · ${f} fotos` + (fila ? ` · fotos enviadas: ${fila.prox}/${f}` : '')));
    $('[data-a=preencher]').disabled = !naTelaDoLaudo();
    $('[data-a=fotos]').disabled = !naTelaDoLaudo() || !f;
    $('[data-a=fotos]').textContent = fila && fila.prox > 0 && fila.prox < f ? `3 · Continuar fotos (${fila.prox + 1} de ${f})` : `3 · Enviar fotos (${f})`;
  }

  /* ---------- preencher ---------- */
  async function preencheCampo(aba, c, v, res) {
    const [k, rot, tipo, sel, opts] = c;
    const nome = `${aba} › ${rot}`;
    if (tipo === 'cg') {
      const marcados = new Set((v || []).map(norm));
      for (const [s, lb] of opts) {
        const cont = achar(aba, s); const inp = cont && cont.querySelector('input[type=checkbox]'); const caixa = cont && cont.querySelector('.ui-chkbox-box');
        if (!inp || !caixa) { res.falta.push(`${nome}: ${lb}`); continue; }
        const quer = marcados.has(norm(lb));
        if (inp.checked !== quer) { if (caixa.classList.contains('ui-state-disabled') || inp.disabled) { res.bloq.push(`${nome}: ${lb}`); continue; } caixa.click(); await ocioso(); }
      }
      res.ok++; return;
    }
    if (tipo === 'k') {
      const P = painel(aba); const inps = [...P.querySelectorAll('input[type=checkbox][name$="-' + sel + '"]')];
      if (!inps.length) { res.falta.push(nome); return; }
      const marcados = new Set((v || []).map(norm)); let achou = 0;
      for (const inp of inps) {
        const lb = norm((document.querySelector('label[for="' + inp.id + '"]') || {}).textContent);
        const quer = marcados.has(lb); if (quer) achou++;
        if (inp.checked !== quer && !inp.disabled) { inp.click(); await ocioso(); }
      }
      if (achou < marcados.size) res.opc.push(`${nome}: ${marcados.size - achou} opção(ões) não encontrada(s)`);
      res.ok++; return;
    }
    if (tipo === 'r') {
      const P = painel(aba); const inps = [...P.querySelectorAll('input[type=radio][name$="-' + sel + '"]')];
      if (!inps.length) { res.falta.push(nome); return; }
      const alvo = inps.find(i => norm((document.querySelector('label[for="' + i.id + '"]') || {}).textContent) === norm(v));
      if (!alvo) { res.opc.push(`${nome}: "${v}"`); return; }
      if (alvo.disabled) { res.bloq.push(nome); return; }
      if (!alvo.checked) { alvo.click(); await ocioso(); }
      res.ok++; return;
    }
    if (tipo === 'gps') {
      const e = achar(aba, sel); if (!e) { res.falta.push(nome); return; }
      if (bloqueado(e)) { res.bloq.push(nome); return; }
      escreve(e, `${v.lat}, ${v.lon}`); await ocioso(300);
      const la = achar(aba, 'latitude'), lo = achar(aba, 'longitude');
      if (la && !la.value && !bloqueado(la)) { escreve(la, String(v.lat)); await ocioso(); }
      if (lo && !lo.value && !bloqueado(lo)) { escreve(lo, String(v.lon)); await ocioso(); }
      res.ok++; return;
    }
    const e = achar(aba, sel);
    if (!e) { (k.startsWith('os_') ? res.pulo : res.falta).push(nome); return; }
    if (tipo === 's') {
      if (e.disabled) { res.bloq.push(nome); return; }
      const op = [...e.options].find(o => norm(o.textContent) === norm(v)) || [...e.options].find(o => norm(o.textContent).startsWith(norm(v)));
      if (!op) { res.opc.push(`${nome}: "${v}"`); return; }
      if (e.value !== op.value) { e.value = op.value; ev(e, 'change'); if (window.jQuery) jQuery(e).trigger('chosen:updated').trigger('liszt:updated'); await ocioso(); }
      res.ok++; return;
    }
    if (tipo === 'ac') {
      if (bloqueado(e)) { res.pulo.push(nome); return; }
      e.focus(); e.value = v; ['input', 'keydown', 'keyup'].forEach(t => ev(e, t));
      await sleep(900); await ocioso();
      const pan = document.getElementById(e.id.replace(/_input$/, '_panel'));
      const item = pan && [...pan.querySelectorAll('li')].find(li => norm(li.textContent) === norm(v) || norm(li.getAttribute('data-item-value')) === norm(v));
      if (item) { item.click(); await ocioso(); res.ok++; } else res.opc.push(`${nome}: sugestão "${v}" não apareceu`);
      return;
    }
    // texto, número, data, texto longo
    if (tipo === 'dt') { if (e.disabled) { res.bloq.push(nome); return; } e.value = dataBR(v); ev(e, 'change'); res.ok++; return; }
    if (bloqueado(e)) { if (k.startsWith('os_')) res.pulo.push(nome); else res.bloq.push(nome); return; }
    let val = String(v);
    if (k === 'id_cpfcnpj') {
      val = val.replace(/\D/g, '');
      const rd = document.querySelector('[id$="' + (val.length > 11 ? 'radioMascaraCnpj' : 'radioMascaraCpf') + '"]');
      if (rd && !rd.checked) { rd.click(); await ocioso(); }
      const e2 = achar(aba, sel); if (e2) { escreve(e2, val); await ocioso(); res.ok++; } return;
    }
    if (k === 'end_cep') val = val.replace(/\D/g, '');
    else if (tipo === 'n' && /^\d+\.\d+$/.test(val)) val = val.replace('.', ',');
    if (e.maxLength > 0 && val.length > e.maxLength) { res.opc.push(`${nome}: cortado em ${e.maxLength} caracteres`); val = val.slice(0, e.maxLength); }
    if (e.value === val) { res.ok++; return; }
    escreve(e, val);
    await ocioso(k === 'end_cep' ? 1200 : 120);
    res.ok++;
  }

  async function preencher() {
    if (!cad) return log('Carregue o JSON primeiro.', 'er');
    if (!naTelaDoLaudo()) return log('Abra a tela do laudo (Criar ou Pesquisar Laudo › editar) antes.', 'er');
    parar = false; logEl.textContent = '';
    const abasOff = [...document.querySelectorAll('.ui-tabs-nav li.aba.ui-state-disabled')].length;
    if (abasOff > 1) log('As abas ainda estão bloqueadas: preencho a OS; depois clique em Gravar no SIMIL e rode "Preencher" de novo.', 'av');
    const res = { ok: 0, falta: [], opc: [], bloq: [], pulo: [] };
    for (const a of S.abas) {
      for (const c of a.campos) {
        if (parar) { log('Parado.', 'av'); return fim(res); }
        if (c[0] === '§') continue;
        const v = cad.dados[c[0]];
        if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length && c[2] !== 'cg' && c[2] !== 'k')) continue;
        log(`… ${a.titulo}: ${c[1]}`);
        try { await preencheCampo(a.id, c, v, res); } catch (err) { res.falta.push(`${a.titulo} › ${c[1]} (erro: ${err.message})`); }
        logEl.lastChild.remove();
      }
    }
    fim(res);
  }
  function fim(res) {
    log(`✔ ${res.ok} campos preenchidos.`, 'ok');
    if (res.pulo.length) log(`Já definidos no laudo (pulados): ${res.pulo.length}`);
    res.opc.forEach(x => log('Opção: ' + x, 'av'));
    res.bloq.forEach(x => log('Bloqueado no SIMIL: ' + x, 'av'));
    res.falta.forEach(x => log('Não encontrado: ' + x, 'er'));
    log('Confira as abas e clique em GRAVAR no SIMIL. Depois envie as fotos.', 'ok');
  }

  /* ---------- fotos ---------- */
  function dataURLparaArquivo(url, nome) {
    const [cab, b64] = url.split(','); const mime = (cab.match(/data:([^;]+)/) || [])[1] || 'image/jpeg';
    const bin = atob(b64); const u8 = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) u8[i] = bin.charCodeAt(i);
    return new File([u8], nome, { type: mime });
  }
  async function enviaFoto() {
    if (!cad || !cad.fotos || !cad.fotos.length) return log('Sem fotos no cadastro.', 'er');
    if (!naTelaDoLaudo()) return log('Abra a tela do laudo primeiro.', 'er');
    let fila = await KV.get('fila');
    const os = osDaTela();
    if (!fila || fila.cad !== cad.id || fila.os !== os) fila = { cad: cad.id, os, prox: 0, ativo: true };
    if (fila.prox >= cad.fotos.length) { log('Todas as fotos já foram enviadas para este laudo.', 'ok'); fila.ativo = false; await KV.set('fila', fila); return atualizaInfo(fila); }
    if (window.is_dirty && fila.prox === 0 && !confirm('Há alterações não gravadas. Enviar a foto também submete o formulário. Continuar?')) return;
    const i = fila.prox, f = cad.fotos[i];
    const P = painel('foto');
    const sel = achar('foto', 'ambienteFoto'), desc = achar('foto', 'outros'), inp = achar('foto', 'foto_firefox');
    const bt = P && P.querySelector('[id$="botaoAdicionarFotos"]');
    if (!sel || !inp || !bt) { log('Campos da aba Fotos não encontrados.', 'er'); return; }
    const op = [...sel.options].find(o => norm(o.textContent) === norm(f.amb || 'Outros, Vide Inf. Compl.'));
    if (!op) { log(`Foto ${i + 1}: referência "${f.amb}" não existe no SIMIL.`, 'er'); return; }
    sel.value = op.value; ev(sel, 'change'); await ocioso();
    if (desc) escreve(desc, (f.desc || '').slice(0, desc.maxLength > 0 ? desc.maxLength : 50));
    const nomeArq = `foto_${String(i + 1).padStart(2, '0')}.jpg`;
    const dt = new DataTransfer(); dt.items.add(dataURLparaArquivo(f.img, nomeArq));
    inp.files = dt.files; ev(inp, 'change');
    const falso = P.querySelector('[id$="file-falso"],[name$="file-falso"]'); if (falso) falso.value = nomeArq;
    fila.prox = i + 1; fila.ativo = $('#cadx-auto').checked && fila.prox < cad.fotos.length; await KV.set('fila', fila);
    log(`Enviando foto ${i + 1}/${cad.fotos.length} (${f.amb})… a página vai recarregar.`);
    if (!window.CADX_MODO) log('Depois da recarga, clique no favorito de novo para seguir.', 'av');
    await sleep(300);
    bt.click();
  }
  async function retomaFotos() {
    const fila = await KV.get('fila');
    atualizaInfo(fila);
    if (!fila || !fila.ativo || !cad || fila.cad !== cad.id) return false;
    if (osDaTela() !== fila.os) { log('Laudo na tela é outro — envio de fotos pausado.', 'av'); return false; }
    const erro = [...document.querySelectorAll('.ui-messages-error,.ui-message-error,.alert-error')].map(e => e.textContent.trim()).filter(Boolean).join(' / ');
    if (erro) { fila.prox = Math.max(0, fila.prox - 1); fila.ativo = false; await KV.set('fila', fila); mostrar(true); log('O SIMIL recusou a última foto: ' + erro, 'er'); atualizaInfo(fila); return true; }
    mostrar(true); log(`Foto ${fila.prox} enviada. Seguindo…`, 'ok');
    await sleep(1200);
    if (!parar) enviaFoto();
    return true;
  }

  /* ---------- verificar mapeamento ---------- */
  function verificar() {
    logEl.textContent = ''; let ok = 0; const ruins = [];
    for (const a of S.abas) for (const c of a.campos) {
      if (c[0] === '§') continue; const [, rot, tipo, sel, opts] = c;
      let achou;
      if (tipo === 'cg') achou = opts.every(([s]) => achar(a.id, s));
      else if (tipo === 'r' || tipo === 'k') achou = !!painel(a.id) && !!painel(a.id).querySelector('input[name$="-' + sel + '"]');
      else achou = !!achar(a.id, sel);
      achou ? ok++ : ruins.push(`${a.titulo} › ${rot} (${sel || 'grupo'})`);
    }
    log(`${ok} campos encontrados.`, 'ok'); ruins.forEach(r => log('Não achei: ' + r, 'er'));
    if (!ruins.length) log('Mapeamento conferido com esta versão do SIMIL.', 'ok');
  }

  /* ---------- ações ---------- */
  box.addEventListener('click', async e => {
    const a = e.target.closest('[data-a]'); if (!a) return; const ac = a.dataset.a;
    if (ac === 'min') mostrar(false);
    if (ac === 'carregar') arq.click();
    if (ac === 'preencher') { a.disabled = true; try { await preencher(); } finally { a.disabled = false; } }
    if (ac === 'fotos') { const fila = await KV.get('fila'); if (fila && fila.cad === cad.id) { fila.ativo = $('#cadx-auto').checked; await KV.set('fila', fila); } enviaFoto(); }
    if (ac === 'parar') { parar = true; const fila = await KV.get('fila'); if (fila) { fila.ativo = false; await KV.set('fila', fila); } log('Parado.', 'av'); }
    if (ac === 'verificar') verificar();
  });
  arq.addEventListener('change', async () => {
    const f = arq.files[0]; arq.value = ''; if (!f) return;
    try {
      const c = JSON.parse(await f.text());
      if (c.app !== 'cadastroscx' || !c.dados) throw new Error('não é um cadastro do app de campo');
      cad = c; await KV.set('cad', c); await KV.set('fila', null);
      logEl.textContent = ''; log(`Carregado: ${c.titulo || c.id}`, 'ok');
      if (c.schema && c.schema !== S.versao) log(`Cadastro feito com mapa ${c.schema}; preenchedor usa ${S.versao}.`, 'av');
      atualizaInfo(null);
    } catch (err) { log('Arquivo inválido: ' + err.message, 'er'); }
  });

  window.__cadx = { abrir: () => mostrar(true) };

  /* ---------- início ---------- */
  function carregaSchema() {
    if (window.SIMIL_SCHEMA) return Promise.resolve(window.SIMIL_SCHEMA);
    return new Promise((ok, err) => { const s = document.createElement('script'); s.src = BASE + 'schema.js?v=' + Date.now(); s.onload = () => ok(window.SIMIL_SCHEMA); s.onerror = () => err(new Error('schema.js')); document.head.appendChild(s); });
  }
  (async () => {
    mostrar(!window.CADX_MODO);
    try { S = await carregaSchema(); } catch { log('Não consegui baixar schema.js de ' + BASE, 'er'); return; }
    cad = await KV.get('cad');
    if (cad) log(`Cadastro em memória: ${cad.titulo || cad.id}`);
    if (!naTelaDoLaudo()) log('Abra Laudo Avaliação › Unidade Isolada Construção › Criar/Pesquisar Laudo.', 'av');
    const retomou = await retomaFotos();
    if (!retomou) atualizaInfo(await KV.get('fila'));
  })();
})();
