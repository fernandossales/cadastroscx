/* geo.js — localização, município/UF, EXIF de fotos e carimbo.
   Usado pelo app de campo (index.html) e pelo preenchedor do SIMIL (simil-preencher.js). */
(function () {
  const G = {};

  /* ---- GPS: observa por alguns segundos e fica com a leitura mais precisa ---- */
  G.posicao = function ({ maxMs = 12000, alvo = 12, aoAtualizar } = {}) {
    return new Promise((ok, err) => {
      if (!navigator.geolocation) return err(new Error('GPS indisponível neste aparelho.'));
      let melhor = null, fim = false;
      const encerra = () => { if (fim) return; fim = true; navigator.geolocation.clearWatch(id); clearTimeout(t); melhor ? ok(melhor) : err(new Error('Sem sinal de GPS. Tente ao ar livre.')); };
      const id = navigator.geolocation.watchPosition(p => {
        const l = { lat: +p.coords.latitude.toFixed(6), lon: +p.coords.longitude.toFixed(6), prec: Math.round(p.coords.accuracy), hora: new Date(p.timestamp || Date.now()).toISOString() };
        if (!melhor || l.prec <= melhor.prec) { melhor = l; aoAtualizar && aoAtualizar(l); }
        if (l.prec <= alvo) encerra();
      }, e => {
        if (e.code === 1) { fim = true; navigator.geolocation.clearWatch(id); clearTimeout(t); return err(new Error('Permissão de localização negada. Ajustes › Privacidade › Serviços de Localização › Safari: “Ao Usar”.')); }
        if (melhor) encerra();
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: maxMs });
      const t = setTimeout(encerra, maxMs);
    });
  };

  /* ---- Município / UF por coordenada (precisa de internet; cache local) ---- */
  const CACHE = 'cadx-lugar';
  const lerCache = () => { try { return JSON.parse(localStorage.getItem(CACHE) || '{}'); } catch { return {}; } };
  let fila = Promise.resolve();
  G.lugar = function (lat, lon) {
    const k = (+lat).toFixed(4) + ',' + (+lon).toFixed(4);
    const c = lerCache(); if (c[k]) return Promise.resolve(c[k]);
    if (navigator.onLine === false) return Promise.reject(new Error('offline'));
    // fila: no máximo 1 consulta por segundo (política do Nominatim)
    const p = fila.then(async () => {
      let r = null;
      try {
        const u = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&addressdetails=1&zoom=18&accept-language=pt-BR&lat=${lat}&lon=${lon}`;
        const j = await (await fetch(u, { headers: { Accept: 'application/json' } })).json();
        const a = j.address || {};
        const uf = ((a['ISO3166-2-lvl4'] || '').split('-')[1]) || '';
        r = { municipio: a.city || a.town || a.village || a.municipality || a.county || '', uf, bairro: a.suburb || a.neighbourhood || a.quarter || '', logradouro: a.road || '', cep: (a.postcode || '').replace(/\D/g, ''), fonte: 'OpenStreetMap' };
      } catch { /* tenta a alternativa */ }
      if (!r || !r.municipio) {
        const j = await (await fetch(`https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lon}&localityLanguage=pt`)).json();
        r = { municipio: j.city || j.locality || '', uf: (j.principalSubdivisionCode || '').split('-')[1] || '', bairro: '', logradouro: '', cep: (j.postcode || '').replace(/\D/g, ''), fonte: 'BigDataCloud' };
      }
      await new Promise(s => setTimeout(s, 1100));
      if (!r.municipio) throw new Error('município não encontrado');
      const c2 = lerCache(); c2[k] = r; try { localStorage.setItem(CACHE, JSON.stringify(c2)); } catch { }
      return r;
    });
    fila = p.catch(() => { });
    return p;
  };

  /* ---- EXIF: GPS e data de fotos JPEG (fotos do álbum) ---- */
  G.exif = function (buf) {
    try {
      const v = new DataView(buf);
      if (v.getUint16(0) !== 0xFFD8) return null;
      let o = 2;
      while (o < v.byteLength - 4) {
        const m = v.getUint16(o), len = v.getUint16(o + 2);
        if (m === 0xFFE1 && v.getUint32(o + 4) === 0x45786966) return tiff(v, o + 10);
        if ((m & 0xFF00) !== 0xFF00) break;
        o += 2 + len;
      }
    } catch { }
    return null;
  };
  function tiff(v, t) {
    const le = v.getUint16(t) === 0x4949;
    const u16 = o => v.getUint16(o, le), u32 = o => v.getUint32(o, le);
    const ifd = o => { const n = u16(o), r = {}; for (let i = 0; i < n; i++) { const e = o + 2 + i * 12; r[u16(e)] = { tipo: u16(e + 2), qtd: u32(e + 4), val: e + 8 }; } return r; };
    const rac = (e, i) => { const p = t + u32(e.val) + i * 8; return u32(p) / (u32(p + 4) || 1); };
    const txt = e => { const p = e.qtd > 4 ? t + u32(e.val) : e.val; let s = ''; for (let i = 0; i < e.qtd - 1; i++) s += String.fromCharCode(v.getUint8(p + i)); return s; };
    const ifd0 = ifd(t + u32(t + 4)); const out = {};
    if (ifd0[0x8769]) { const ex = ifd(t + u32(ifd0[0x8769].val)); if (ex[0x9003]) { const m = txt(ex[0x9003]).match(/(\d{4}):(\d\d):(\d\d) (\d\d):(\d\d):(\d\d)/); if (m) out.data = new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5], +m[6]).toISOString(); } }
    if (ifd0[0x8825]) {
      const g = ifd(t + u32(ifd0[0x8825].val));
      if (g[2] && g[4]) {
        const dms = e => rac(e, 0) + rac(e, 1) / 60 + rac(e, 2) / 3600;
        let lat = dms(g[2]), lon = dms(g[4]);
        if (g[1] && String.fromCharCode(v.getUint8(g[1].val)) === 'S') lat = -lat;
        if (g[3] && String.fromCharCode(v.getUint8(g[3].val)) === 'W') lon = -lon;
        if (lat || lon) { out.lat = +lat.toFixed(6); out.lon = +lon.toFixed(6); }
      }
    }
    return out.lat !== undefined || out.data ? out : null;
  }

  /* ---- Imagem: reduzir e carimbar ---- */
  async function bitmap(blob) {
    if (window.createImageBitmap) { try { return await createImageBitmap(blob); } catch { } }
    return new Promise((ok, err) => { const i = new Image(); i.onload = () => ok(i); i.onerror = () => err(new Error('imagem ilegível')); i.src = URL.createObjectURL(blob); });
  }
  const paraBlob = (c, q) => new Promise(ok => c.toBlob(ok, 'image/jpeg', q));
  G.reduzir = async function (blob, max = 1600, q = 0.82) {
    const src = await bitmap(blob); const r = Math.min(1, max / Math.max(src.width, src.height));
    const c = document.createElement('canvas'); c.width = Math.round(src.width * r); c.height = Math.round(src.height * r);
    c.getContext('2d').drawImage(src, 0, 0, c.width, c.height);
    return paraBlob(c, q);
  };
  G.linhasCarimbo = function (f) {
    const d = f.hora ? new Date(f.hora) : null;
    const l = [];
    if (d) l.push(d.toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }));
    if (f.lat != null) l.push(`${(+f.lat).toFixed(6)}, ${(+f.lon).toFixed(6)}` + (f.prec ? `  ±${f.prec} m` : ''));
    if (f.municipio) l.push(`${f.municipio}${f.uf ? ' – ' + f.uf : ''}`);
    return l;
  };
  G.carimbar = async function (blob, linhas, q = 0.85) {
    const src = await bitmap(blob); const c = document.createElement('canvas'); c.width = src.width; c.height = src.height;
    const x = c.getContext('2d'); x.drawImage(src, 0, 0);
    if (!linhas.length) return paraBlob(c, q);
    const fs = Math.max(14, Math.round(c.width * 0.026)), pad = Math.round(fs * 0.6), lh = Math.round(fs * 1.3);
    const h = pad * 2 + lh * linhas.length;
    x.fillStyle = 'rgba(0,0,0,.55)'; x.fillRect(0, c.height - h, c.width, h);
    x.fillStyle = '#fff'; x.font = `600 ${fs}px system-ui, -apple-system, "Segoe UI", sans-serif`; x.textBaseline = 'top';
    linhas.forEach((s, i) => x.fillText(s, pad, c.height - h + pad + i * lh));
    return paraBlob(c, q);
  };
  G.blobParaDataURL = b => new Promise((ok, err) => { const r = new FileReader(); r.onload = () => ok(r.result); r.onerror = err; r.readAsDataURL(b); });
  G.dataURLparaBlob = u => { const [cab, b64] = u.split(','); const mime = (cab.match(/data:([^;]+)/) || [])[1] || 'image/jpeg'; const s = atob(b64); const a = new Uint8Array(s.length); for (let i = 0; i < s.length; i++) a[i] = s.charCodeAt(i); return new Blob([a], { type: mime }); };

  window.CADX_GEO = G;
})();
